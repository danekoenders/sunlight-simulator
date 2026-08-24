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
import { calculate3DDestinationPoint } from "./Map/RayTracing";
import {
  fetchDayWeather,
  type DayWeather,
} from "../lib/weather";
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

/** Below this width the panel becomes a bottom sheet. Matches app.css. */
const SHEET_BREAKPOINT = 560;

const RAY_SOURCE = "ray-source";
const RAY_GROUND_SOURCE = "ray-ground-source";

const SUN_RGB = "245, 158, 11";
const SHADE_RGB = "70, 104, 154";

/**
 * How far the beam runs before it has faded out entirely, in kilometres.
 * Kept short: under the map's pitch, elevation projects a long way up the
 * screen, so even a modest ray draws a long line across the viewport.
 */
const RAY_LENGTH_KM = 0.06;

/**
 * Solid at the spot, gone by the end, so the beam reads as light heading off
 * into the sky rather than a line that simply stops.
 *
 * line-width takes no line-progress, so the shaft can't taper. Two passes at
 * different widths — a soft glow under a bright core — give it depth instead.
 */
const sunbeamGradient = (rgb: string, alpha: number) => [
  "interpolate",
  ["linear"],
  ["line-progress"],
  0,
  `rgba(${rgb}, ${alpha})`,
  0.35,
  `rgba(${rgb}, ${alpha})`,
  1,
  `rgba(${rgb}, 0)`,
];

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

  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [isLocating, setIsLocating] = useState(false);

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
      // line-metrics powers both the elevation ramp and the fade, which are
      // driven off line-progress.
      instance.addSource(RAY_SOURCE, {
        type: "geojson",
        lineMetrics: true,
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addSource(RAY_GROUND_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Where the beam would fall if it were lying flat. Anchors the beam to
      // a place on the ground, which is hard to judge from a floating line.
      instance.addLayer({
        id: "ray-ground-layer",
        type: "line",
        source: RAY_GROUND_SOURCE,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": `rgb(${SUN_RGB})`,
          "line-width": 1.5,
          "line-dasharray": [1, 2],
          "line-opacity": 0.35,
        },
      });

      instance.addLayer({
        id: "ray-glow-layer",
        type: "line",
        source: RAY_SOURCE,
        layout: {
          "line-cap": "round",
          "line-elevation-reference": "ground",
          "line-z-offset": [
            "at-interpolated",
            ["*", ["line-progress"], ["-", ["length", ["get", "elevation"]], 1]],
            ["get", "elevation"],
          ],
        },
        paint: {
          "line-width": 18,
          "line-blur": 10,
          "line-emissive-strength": 1,
          "line-gradient": sunbeamGradient(SUN_RGB, 0.35),
        },
      } as never);

      // The beam itself: one straight 3D line, elevated per-vertex. A sun ray
      // is straight, so two points interpolate exactly — no faceting.
      instance.addLayer({
        id: "ray-layer",
        type: "line",
        source: RAY_SOURCE,
        layout: {
          "line-cap": "round",
          "line-join": "round",
          "line-elevation-reference": "ground",
          "line-z-offset": [
            "at-interpolated",
            ["*", ["line-progress"], ["-", ["length", ["get", "elevation"]], 1]],
            ["get", "elevation"],
          ],
        },
        paint: {
          "line-width": 6,
          "line-blur": 1,
          "line-emissive-strength": 1,
          "line-gradient": sunbeamGradient(SUN_RGB, 1),
        },
      } as never);
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

      const beam = instance.getSource(RAY_SOURCE) as mapboxgl.GeoJSONSource;
      const ground = instance.getSource(
        RAY_GROUND_SOURCE
      ) as mapboxgl.GeoJSONSource;
      const empty = { type: "FeatureCollection" as const, features: [] };

      if (sun.altitudeDegrees <= 0) {
        beam.setData(empty);
        ground.setData(empty);
        return;
      }

      const rayEnd = calculate3DDestinationPoint(
        point,
        RAY_LENGTH_KM,
        sun.azimuthDegrees,
        sun.altitudeDegrees
      );

      // Two points and their heights; line-z-offset interpolates between them.
      const beamFeature: Feature<LineString, GeoJsonProperties> = {
        type: "Feature",
        properties: { elevation: [0, rayEnd.elevation] },
        geometry: {
          type: "LineString",
          coordinates: [point, rayEnd.position],
        },
      };

      beam.setData({ type: "FeatureCollection", features: [beamFeature] });
      ground.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [point, rayEnd.position],
            },
          } as Feature<LineString, GeoJsonProperties>,
        ],
      });

      const rgb = inSun ? SUN_RGB : SHADE_RGB;
      instance.setPaintProperty(
        "ray-layer",
        "line-gradient",
        sunbeamGradient(rgb, 1) as never
      );
      instance.setPaintProperty(
        "ray-glow-layer",
        "line-gradient",
        sunbeamGradient(rgb, 0.35) as never
      );
      instance.setPaintProperty(
        "ray-ground-layer",
        "line-color",
        `rgb(${rgb})`
      );
    },
    []
  );

  const clearRay = useCallback(() => {
    const instance = map.current;
    if (!instance?.getSource(RAY_SOURCE)) return;

    const empty = { type: "FeatureCollection" as const, features: [] };
    (instance.getSource(RAY_SOURCE) as mapboxgl.GeoJSONSource).setData(empty);
    (instance.getSource(RAY_GROUND_SOURCE) as mapboxgl.GeoJSONSource).setData(
      empty
    );
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

  const checkSpot = useCallback(
    (at?: mapboxgl.LngLat) => {
    const instance = map.current;
    if (!instance) return;

    const center = at ?? instance.getCenter();
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
    },
    [currentTime, onSpotChange]
  );

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

  /* ---------------------------------------------------------------- *
   * Weather
   *
   * A clear line to the sun still isn't sun if the sky is shut. Fetched per
   * spot, not per scrub, and failure is silent: the geometric answer is the
   * part this app owns.
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPoint) {
      setWeather(null);
      return;
    }

    const controller = new AbortController();
    fetchDayWeather(
      selectedPoint.latitude,
      selectedPoint.longitude,
      currentTime,
      controller.signal
    ).then((result) => {
      if (!controller.signal.aborted) setWeather(result);
    });

    return () => controller.abort();
    // Only the spot and the calendar day matter; scrubbing within a day reuses
    // the same forecast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint?.latitude, selectedPoint?.longitude, currentTime.toDateString()]);

  /* ---------------------------------------------------------------- *
   * Locating
   * ---------------------------------------------------------------- */

  const locateMe = useCallback(() => {
    const instance = map.current;
    if (!instance || !navigator.geolocation) {
      setMapError("This browser can't share your location.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        instance.easeTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(instance.getZoom(), 18),
          duration: 1200,
        });
      },
      () => {
        setIsLocating(false);
        setMapError("Couldn't get your location. Check location permissions.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  const handleSearchSelect = useCallback(() => {
    if (placementStateRef.current === "placed") resetSpot();
  }, [resetSpot]);

  /* ---------------------------------------------------------------- *
   * Tapping the map
   *
   * On a phone, panning a reticle onto a doorway is fiddly; tapping the spot
   * is one action and lands where you look. The reticle stays for the times
   * when a fingertip is too blunt — a fingertip covers roughly a doorway's
   * width at this zoom — so both routes are available.
   * ---------------------------------------------------------------- */

  useEffect(() => {
    const instance = map.current;
    if (!instance || !isMapLoaded) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isZoomSufficient) return;
      checkSpotRef.current?.(e.lngLat);
    };

    instance.on("click", handleClick);
    instance.getCanvas().style.cursor = isZoomSufficient ? "crosshair" : "";

    return () => {
      instance.off("click", handleClick);
    };
  }, [isMapLoaded, isZoomSufficient]);

  /* ---------------------------------------------------------------- *
   * Keeping the spot clear of the sheet
   *
   * On narrow screens the panel is a bottom sheet covering nearly half the
   * map. Padding the map moves its centre into what's actually visible, so
   * the reticle and the placed pin sit above the sheet rather than behind it.
   * ---------------------------------------------------------------- */

  useEffect(() => {
    const instance = map.current;
    if (!instance || !isMapLoaded) return;

    const applyPadding = () => {
      const panel = document.querySelector<HTMLElement>(".panel");
      const isSheet = window.innerWidth <= SHEET_BREAKPOINT;
      const bottom = isSheet && panel ? panel.offsetHeight : 0;

      instance.setPadding({ top: 0, left: 0, right: 0, bottom });
      // The reticle marks the padded centre, so it has to shift with it.
      instance
        .getContainer()
        .style.setProperty("--map-pad-bottom", `${bottom}px`);
    };

    applyPadding();
    window.addEventListener("resize", applyPadding);
    return () => window.removeEventListener("resize", applyPadding);
  }, [isMapLoaded, placementState, timeline, isCalculating]);

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

      {isMapLoaded && (
        <button
          className="locate-button"
          onClick={locateMe}
          disabled={isLocating}
          aria-label="Go to my location"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3.4" fill="currentColor" />
            <circle
              cx="12"
              cy="12"
              r="7.4"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 1.6v3M12 19.4v3M22.4 12h-3M4.6 12h-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
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
          weather={weather}
          sunrise={sunTimes.sunrise}
          sunset={sunTimes.sunset}
          onCheck={() => checkSpot()}
          onReset={resetSpot}
          onTimeChange={onTimeChange}
        />
      )}
    </div>
  );
};

export default Map;
