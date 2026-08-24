import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Feature, LineString, GeoJsonProperties } from "geojson";

import {
  getSunPosition,
  sunPositionToMapboxLight,
  getSunTimes,
  computeDayTimeline,
  type DaySample,
  type SunPosition,
} from "../lib/sunUtils";
import { calculate3DDestinationPoint, createRay3DSegments } from "./Map/RayTracing";
import TopBar from "./Map/TopBar";
import VerdictPanel from "./Map/VerdictPanel";
import { MapProps, PlacementState, SelectedPoint } from "./Map/types";

const MAP_STYLE = "mapbox://styles/danekoenders/cm8824x5800b901qr2tt8e6pz";

/**
 * Below this, the 3D buildings that cast the shadows aren't rendered, so
 * there is nothing to trace against and any answer would be a guess.
 */
const ZOOM_THRESHOLD = 16.5;

/** How often the day is sampled when building the timeline. */
const TIMELINE_STEP_MINUTES = 10;

const RAY_SOURCE = "ray-source";
const RAY_SEGMENTS_SOURCE = "ray-segments-source";

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

const Map: React.FC<MapProps> = ({
  onMapLoad,
  lat: initialLat = 51.9244,
  lng: initialLng = 4.4626,
  zoom: initialZoom = 17.5,
  autoCheck = false,
  currentTime,
  onTimeChange,
  onSpotChange,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const placedMarker = useRef<mapboxgl.Marker | null>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isZoomSufficient, setIsZoomSufficient] = useState(
    initialZoom >= ZOOM_THRESHOLD
  );
  const [placementState, setPlacementState] = useState<PlacementState>("idle");
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [timeline, setTimeline] = useState<DaySample[] | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [sunTimes, setSunTimes] = useState<{
    sunrise: Date | null;
    sunset: Date | null;
  }>({ sunrise: null, sunset: null });

  // Listeners registered once at mount would otherwise close over the first
  // render's state; these keep them reading live values.
  const placementStateRef = useRef(placementState);
  placementStateRef.current = placementState;
  const autoCheckRef = useRef(autoCheck);

  useEffect(() => {
    if (!mapError) return;
    const timer = setTimeout(() => setMapError(null), 6000);
    return () => clearTimeout(timer);
  }, [mapError]);

  /* ---------------------------------------------------------------- *
   * Map setup
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapError("No Mapbox token configured, so the map can't load.");
      return;
    }

    mapboxgl.accessToken = token;

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [initialLng, initialLat],
      zoom: initialZoom,
      pitch: 55,
      bearing: -17.6,
      antialias: true,
      attributionControl: false,
    });

    map.current = instance;
    instance.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    instance.on("style.load", () => {
      instance.addSource(RAY_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addSource(RAY_SEGMENTS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      instance.addLayer({
        id: "ray-layer",
        type: "fill-extrusion",
        source: RAY_SEGMENTS_SOURCE,
        filter: ["==", "isRaySegment", true],
        paint: {
          "fill-extrusion-color": "#f59e0b",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 0.5,
        },
      });

      instance.addLayer({
        id: "ray-path-layer",
        type: "line",
        source: RAY_SOURCE,
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.7,
        },
      });
    });

    instance.on("load", () => {
      setIsMapLoaded(true);
      onMapLoad?.();

      // A shared link already names a spot; measuring it on arrival is the
      // whole point of the link. Wait for `idle` so the buildings the trace
      // queries have actually rendered.
      if (autoCheckRef.current) {
        instance.once("idle", () => checkSpotRef.current?.());
      }
    });

    const syncZoom = () =>
      setIsZoomSufficient(instance.getZoom() >= ZOOM_THRESHOLD);
    instance.on("zoom", syncZoom);

    instance.on("error", (e) => {
      if (e?.error?.message) setMapError(e.error.message);
    });

    return () => {
      instance.off("zoom", syncZoom);
      placedMarker.current?.remove();
      placedMarker.current = null;
      instance.remove();
      map.current = null;
    };
    // Mount only: the initial camera is an opening position, not live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- *
   * Lighting — the map itself shows the sun, so it tracks the scrubber
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    const center = selectedPoint
      ? { lat: selectedPoint.latitude, lng: selectedPoint.longitude }
      : map.current.getCenter();

    const sun = getSunPosition(currentTime, center.lat, center.lng);
    const { ambient, directional } = sunPositionToMapboxLight(sun);

    const lights: unknown[] = [
      {
        id: "ambient-light",
        type: "ambient",
        properties: { color: ambient.color, intensity: ambient.intensity },
      },
    ];

    if (sun.altitudeDegrees > 0) {
      lights.push({
        id: "directional-light",
        type: "directional",
        properties: {
          color: directional.color,
          intensity: directional.intensity,
          direction: directional.direction,
          castShadows: true,
        },
      });
    }

    try {
      map.current.setLights(lights as never);
    } catch {
      // An older style without the lights API still renders; it just won't
      // move its shadows. Not worth interrupting the user over.
    }
  }, [currentTime, isMapLoaded, selectedPoint]);

  /* ---------------------------------------------------------------- *
   * Sunrise / sunset for whatever place is in view
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    const center = selectedPoint
      ? { lat: selectedPoint.latitude, lng: selectedPoint.longitude }
      : map.current.getCenter();

    const times = getSunTimes(currentTime, center.lat, center.lng);
    const valid = (d: Date) => d instanceof Date && !isNaN(d.getTime());

    setSunTimes({
      sunrise: valid(times.sunrise) ? times.sunrise : null,
      sunset: valid(times.sunset) ? times.sunset : null,
    });
  }, [currentTime, isMapLoaded, selectedPoint]);

  /* ---------------------------------------------------------------- *
   * Ray visual — redrawn as the scrubber moves
   * ---------------------------------------------------------------- */

  const drawRay = useCallback(
    (point: [number, number], sun: SunPosition, inSun: boolean) => {
      const instance = map.current;
      if (!instance?.getSource(RAY_SOURCE)) return;

      const raySource = instance.getSource(RAY_SOURCE) as mapboxgl.GeoJSONSource;
      const segmentSource = instance.getSource(
        RAY_SEGMENTS_SOURCE
      ) as mapboxgl.GeoJSONSource;

      if (sun.altitudeDegrees <= 0) {
        raySource.setData({ type: "FeatureCollection", features: [] });
        segmentSource.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const rayEnd = calculate3DDestinationPoint(
        point,
        1.0,
        sun.azimuthDegrees,
        sun.altitudeDegrees
      );

      const rayFeature: Feature<LineString, GeoJsonProperties> = {
        type: "Feature",
        properties: {
          altitude: sun.altitudeDegrees,
          azimuth: sun.azimuthDegrees,
        },
        geometry: {
          type: "LineString",
          coordinates: [point, rayEnd.position],
        },
      };

      raySource.setData({ type: "FeatureCollection", features: [rayFeature] });
      segmentSource.setData({
        type: "FeatureCollection",
        features: createRay3DSegments(
          instance,
          point,
          rayEnd.position,
          0,
          rayEnd.elevation,
          30
        ),
      });

      const color = inSun ? "#f59e0b" : "#46689a";
      instance.setPaintProperty("ray-layer", "fill-extrusion-color", color);
      instance.setPaintProperty("ray-path-layer", "line-color", color);
    },
    []
  );

  const clearRay = useCallback(() => {
    const instance = map.current;
    if (!instance?.getSource(RAY_SOURCE)) return;

    const empty = { type: "FeatureCollection" as const, features: [] };
    (instance.getSource(RAY_SOURCE) as mapboxgl.GeoJSONSource).setData(empty);
    (
      instance.getSource(RAY_SEGMENTS_SOURCE) as mapboxgl.GeoJSONSource
    ).setData(empty);
  }, []);

  /* ---------------------------------------------------------------- *
   * Scrubbing
   *
   * The timeline already holds the traced answer for every step of the
   * day, so moving the scrubber is a lookup rather than a fresh trace.
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPoint || !timeline || !isMapLoaded) return;

    const minutes = minutesOf(currentTime);
    const nearest = timeline.reduce((best, s) =>
      Math.abs(s.minutes - minutes) < Math.abs(best.minutes - minutes) ? s : best
    );

    const point: [number, number] = [
      selectedPoint.longitude,
      selectedPoint.latitude,
    ];
    const sun = getSunPosition(
      currentTime,
      selectedPoint.latitude,
      selectedPoint.longitude
    );

    drawRay(point, sun, nearest.inSun);

    if (nearest.inSun !== selectedPoint.isInSunlight) {
      setSelectedPoint((prev) =>
        prev ? { ...prev, isInSunlight: nearest.inSun } : prev
      );
    }
  }, [currentTime, timeline, selectedPoint, isMapLoaded, drawRay]);

  // The marker carries the verdict in its colour; recolour it in place
  // rather than tearing it down and rebuilding it on every change.
  useEffect(() => {
    const element = placedMarker.current?.getElement();
    if (!element || !selectedPoint) return;

    element.className = `placed-marker ${
      selectedPoint.isInSunlight ? "sunlight" : "shadow"
    }`;
  }, [selectedPoint]);

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  const checkSpot = useCallback(() => {
    const instance = map.current;
    if (!instance) return;

    const center = instance.getCenter();
    const point: [number, number] = [center.lng, center.lat];

    setIsCalculating(true);
    setPlacementState("placed");

    const element = document.createElement("div");
    element.className = "placed-marker";
    element.innerHTML = `<div class="placed-marker-halo"></div><div class="placed-marker-dot"></div>`;

    placedMarker.current?.remove();
    placedMarker.current = new mapboxgl.Marker({ element, anchor: "center" })
      .setLngLat(center)
      .addTo(instance);

    // Yield a frame so the marker paints before the trace blocks the thread.
    requestAnimationFrame(() => {
      let day: DaySample[] | null = null;
      try {
        day = computeDayTimeline(
          instance,
          point,
          currentTime,
          TIMELINE_STEP_MINUTES
        );
      } catch {
        setMapError("Couldn't read the buildings here. Try moving the map.");
      }

      const minutes = minutesOf(currentTime);
      const nearest = day?.reduce((best, s) =>
        Math.abs(s.minutes - minutes) < Math.abs(best.minutes - minutes)
          ? s
          : best
      );

      setTimeline(day);
      setSelectedPoint({
        latitude: center.lat,
        longitude: center.lng,
        isInSunlight: nearest?.inSun ?? false,
      });
      setIsCalculating(false);
      onSpotChange?.({ lat: center.lat, lng: center.lng });
    });
  }, [currentTime, onSpotChange]);

  // Lets the mount-only `idle` handler call the latest version.
  const checkSpotRef = useRef(checkSpot);
  checkSpotRef.current = checkSpot;

  const resetSpot = useCallback(() => {
    placedMarker.current?.remove();
    placedMarker.current = null;
    setPlacementState("idle");
    setSelectedPoint(null);
    setTimeline(null);
    clearRay();
    onSpotChange?.(null);
  }, [clearRay, onSpotChange]);

  const handleSearchSelect = useCallback(() => {
    if (placementStateRef.current === "placed") resetSpot();
  }, [resetSpot]);

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  return (
    <div className="map-container" ref={mapContainer}>
      {/* The reticle marks the map's exact centre, which is the point that
          gets measured — so what you aim at is what you get. */}
      {isMapLoaded && placementState === "idle" && isZoomSufficient && (
        <div className="center-reticle" aria-hidden>
          <div className="center-marker-icon">
            <div className="center-marker-pulse" />
            <div className="center-marker-ring" />
          </div>
        </div>
      )}

      {isMapLoaded && map.current && (
        <TopBar map={map.current} onLocationSelect={handleSearchSelect} />
      )}

      {mapError && (
        <div className="toast" role="status">
          <span>{mapError}</span>
          <button onClick={() => setMapError(null)}>Dismiss</button>
        </div>
      )}

      {isMapLoaded && onTimeChange && (
        <VerdictPanel
          placementState={placementState}
          isZoomSufficient={isZoomSufficient}
          selectedPoint={selectedPoint}
          currentTime={currentTime}
          timeline={timeline}
          isCalculating={isCalculating}
          sunrise={sunTimes.sunrise}
          sunset={sunTimes.sunset}
          onCheck={checkSpot}
          onReset={resetSpot}
          onTimeChange={onTimeChange}
        />
      )}
    </div>
  );
};

export default Map;
