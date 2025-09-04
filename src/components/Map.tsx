/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import mapboxgl from "mapbox-gl";
import {
  getSunPosition,
  sunPositionToMapboxLight,
  isPointInSunlight,
  isPointInSunlightWithShadows,
  getSunTimes,
  SunPosition,
} from "../lib/sunUtils";
import * as turf from "@turf/turf";
import { Feature, LineString, GeoJsonProperties } from "geojson";

// Import our extracted components and utilities
import { SunMarker } from "./Map/SunMarker";
import { calculate3DDestinationPoint, createRay3DSegments } from "./Map/RayTracing";
import SearchBoxWrapper from "./Map/SearchBoxWrapper";
import MapControls from "./Map/MapControls";
import TimeSlider from "./TimeSlider";
import { MapProps, PlacementState, SelectedPoint } from "./Map/types";

const Map: React.FC<MapProps> = ({
  onMapLoad,
  onLocationSelect,
  lat: initialLat = 51.9244,
  lng: initialLng = 4.4626,
  zoom: initialZoom = 16,
  time,
  currentTime,
  onPlacementStateChange,
  onTimeChange,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const sunMarker = useRef<SunMarker | null>(null);
  const suppressCameraEventsRef = useRef<boolean>(false);

  // Map state
  const [lng, setLng] = useState(initialLng);
  const [lat, setLat] = useState(initialLat);
  const [zoom, setZoom] = useState(initialZoom);
  const [pitch, setPitch] = useState(45);
  const [bearing, setBearing] = useState(-17.6);
  const [sunPosition, setSunPosition] = useState<SunPosition | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);

  // New state for placement mode
  const [placementState, setPlacementState] = useState<PlacementState>('idle');
  const [centerMarker, setCenterMarker] = useState<mapboxgl.Marker | null>(null);
  const ZOOM_THRESHOLD = 18; // show UI only when zoomed in enough
  const [isZoomSufficient, setIsZoomSufficient] = useState<boolean>(false);

  // Keep track of animation frame for cleanup
  const requestAnimationFrameId = useRef<number | null>(null);

  // Map states
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Don't show the sun - it's misleading in the view
  const [showSunMarker, setShowSunMarker] = useState(false);

  // Inside the Map component, add a new state for tracking shadow status
  const [selectedPointShadowStatus, setSelectedPointShadowStatus] = useState<boolean | null>(null);

  // Clear any error message after 5 seconds
  useEffect(() => {
    if (mapError) {
      const timer = setTimeout(() => {
        setMapError(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [mapError]);

  // Initialize map on component mount
  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

    const initializedMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/danekoenders/cm8824x5800b901qr2tt8e6pz",
      center: [lng, lat],
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      antialias: true,
    });

    map.current = initializedMap;

    // Navigation controls removed for cleaner interface
    // initializedMap.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Wait for map to be fully loaded
    initializedMap.on("load", () => {
      setIsMapLoaded(true);

      // Try to geolocate user once and center the map accordingly
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userLngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            try {
              initializedMap.setCenter(userLngLat);
              setLng(parseFloat(userLngLat[0].toFixed(4)));
              setLat(parseFloat(userLngLat[1].toFixed(4)));
            } catch {}
          },
          () => {
            // Ignore errors; fallback to initial center
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }

      // Create the center marker using Mapbox Marker with nested div approach
      // Outer div for Mapbox positioning, inner div for our custom styling and transforms
      const markerElement = document.createElement('div');
      const markerInner = document.createElement('div');
      markerInner.className = 'center-marker center-marker-visible';
      markerInner.innerHTML = `
        <div class="center-marker-icon">
          <div class="center-marker-pin"></div>
          <div class="center-marker-point"></div>
          <div class="center-marker-shadow"></div>
        </div>
        <div class="center-marker-text">Move map to place pin</div>
      `;
      markerElement.appendChild(markerInner);

      const marker = new mapboxgl.Marker({
        element: markerElement,
        anchor: 'top', // Anchor to top so we can position down from center
      })
        .setLngLat(initializedMap.getCenter())
        .addTo(initializedMap);
        
      setCenterMarker(marker);

      // Initialize zoom-based visibility immediately
      const startZoom = initializedMap.getZoom();
      const meetsThreshold = startZoom >= ZOOM_THRESHOLD;
      setIsZoomSufficient(meetsThreshold);
      const shouldShowAtStart = placementState === 'idle' && meetsThreshold;
      markerElement.style.display = shouldShowAtStart ? 'block' : 'none';
      markerElement.style.opacity = shouldShowAtStart ? '1' : '0';
      markerElement.style.visibility = shouldShowAtStart ? 'visible' : 'hidden';

      // Notify parent if callback is provided
      if (onMapLoad) {
        onMapLoad();
      }
    });

    // Add 3D buildings once the map style is loaded
    initializedMap.on("style.load", () => {
      // We know the building layer is always called "building-extrusion" in the custom style
      console.log("Using building-extrusion layer for ray tracing");

      // Store the building layer ID for ray tracing
      (initializedMap as any).buildingLayerId = "building-extrusion";

      // Add ray-source back into the initialization
      initializedMap.addSource("ray-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add a source for ray segments
      initializedMap.addSource("ray-segments-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add a layer to visualize ray paths - using fill-extrusion
      initializedMap.addLayer({
        id: "ray-layer",
        type: "fill-extrusion",
        source: "ray-segments-source",
        filter: ["==", "isRaySegment", true],
        paint: {
          "fill-extrusion-color": "#FFDD00",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 0.6,
        },
        layout: {
          visibility: "visible",
        },
      });

      // Add a fallback 2D line layer for compatibility
      initializedMap.addLayer({
        id: "ray-path-layer",
        type: "line",
        source: "ray-source",
        paint: {
          "line-color": "#FFDD00",
          "line-width": 4,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
        },
        layout: {
          visibility: "visible",
        },
      });
    });

    // Update UI visibility on zoom
    const syncZoom = () => {
      const z = initializedMap.getZoom();
      setIsZoomSufficient(z >= ZOOM_THRESHOLD);
      // Toggle center marker visibility at DOM level as well
      const el = centerMarker?.getElement();
      if (el) {
        el.style.display = z >= ZOOM_THRESHOLD && placementState === 'idle' ? 'block' : 'none';
      }
    };
    initializedMap.on('zoom', syncZoom);

    // Clean up on unmount
    return () => {
      if (requestAnimationFrameId.current) {
        cancelAnimationFrame(requestAnimationFrameId.current);
      }
      if (sunMarker.current) {
        sunMarker.current.remove();
      }
      initializedMap.off('zoom', syncZoom);
      initializedMap.remove();
    };
  }, []); // Empty dependency array to run only on mount and unmount

  // Initial sun position calculation - separate from map initialization
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Calculate initial sun position
    const initialSunPosition = getSunPosition(currentTime, lat, lng);
    setSunPosition(initialSunPosition);

    // Set initial lights based on sun position
    const { ambient, directional } = sunPositionToMapboxLight(initialSunPosition);
    try {
      // For night time (sun below horizon), only use ambient light
      if (initialSunPosition.altitudeDegrees <= 0) {
        map.current.setLights([
          {
            id: 'ambient-light',
            type: 'ambient',
            properties: {
              color: ambient.color,
              intensity: ambient.intensity
            }
          } as any
        ]);
      } else {
        // For daytime, use both ambient and directional lights
        map.current.setLights([
          {
            id: 'ambient-light',
            type: 'ambient',
            properties: {
              color: ambient.color,
              intensity: ambient.intensity
            }
          } as any,
          {
            id: 'directional-light',
            type: 'directional',
            properties: {
              color: directional.color,
              intensity: directional.intensity,
              direction: directional.direction
            }
          } as any
        ]);
      }
    } catch (error) {
      console.error('Error setting initial lights:', error);
    }

    // Initialize and add the sun marker only if we want to show it
    if (showSunMarker) {
      sunMarker.current = new SunMarker().addTo(map.current);
      sunMarker.current.updatePosition(
        initialSunPosition,
        map.current.getCenter()
      );
    }
  }, [
    isMapLoaded,
    currentTime,
    lat,
    lng,
    showSunMarker,
  ]);

  // Handle placement state changes
  useEffect(() => {
    if (onPlacementStateChange) {
      onPlacementStateChange(placementState === 'placed');
    }
    
    // Update the center marker visibility based on placement state and zoom threshold
    if (centerMarker) {
      const markerElement = centerMarker.getElement();
      const shouldShow = placementState === 'idle' && isZoomSufficient;
      markerElement.style.display = shouldShow ? 'block' : 'none';
      markerElement.style.opacity = shouldShow ? '1' : '0';
      markerElement.style.visibility = shouldShow ? 'visible' : 'hidden';
    }

    // Set up camera behavior for placed state
    // Note: camera lock behavior is implemented in the dedicated effect below
    // to avoid recursive easeTo loops on 'moveend'.
  }, [placementState, centerMarker, onPlacementStateChange, isMapLoaded, selectedPoint, isZoomSufficient]);

  // Update center marker position when map moves (but only in idle state)
  useEffect(() => {
    if (!map.current || !centerMarker || !isMapLoaded) return;

    const handleMapMove = () => {
      if (!map.current || placementState !== 'idle') return;
      centerMarker.setLngLat(map.current.getCenter());
    };

    map.current.on('move', handleMapMove);

    return () => {
      map.current?.off('move', handleMapMove);
    };
  }, [isMapLoaded, centerMarker, placementState]);

  // Set up proper camera lock when in "placed" state
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Handle camera lock in placed state
    if (placementState === 'placed' && selectedPoint) {
      // TypeScript needs a properly typed coordinate
      const center: [number, number] = [selectedPoint.longitude, selectedPoint.latitude];
      
      // Initially set the center
      map.current.setCenter(center);
      
      // We want to allow rotation, but not panning, so we'll:
      // 1. Disable dragPan but keep other controls (rotation, zoom)
      // 2. Detect when a user tries to change the center and reset it

      // Save current state to restore later
      const wasDragPanEnabled = map.current.dragPan.isEnabled();
      
      // Disable drag-panning (but keep rotate, zoom, etc)
      if (wasDragPanEnabled) {
        map.current.dragPan.disable();
      }
      
      // Track if we're handling a move already to prevent recursive calls
      let isHandlingMove = false;
      
      // Create a smart move handler that won't cause infinite recursion
      const handleMove = () => {
        if (!map.current || isHandlingMove || suppressCameraEventsRef.current) return;
        
        // Get current center
        const currentCenter = map.current.getCenter();
        
        // Check if center has moved significantly
        const hasMoved = 
          Math.abs(currentCenter.lng - center[0]) > 0.0001 || 
          Math.abs(currentCenter.lat - center[1]) > 0.0001;
        
        if (hasMoved) {
          // Set flag to prevent recursion
          isHandlingMove = true;
          
          // Reset center, but keep other camera properties
          map.current.setCenter(center);
          
          // Reset flag after small delay
          setTimeout(() => {
            isHandlingMove = false;
          }, 0);
        }
      };
      
      // Add event listeners (move only to avoid recursive loops)
      map.current.on('move', handleMove);
      
      // Clean up
      return () => {
        if (!map.current) return;
        
        // Remove event listeners
        map.current.off('move', handleMove);
        
        // Restore previous settings
        if (wasDragPanEnabled && !map.current.dragPan.isEnabled()) {
          map.current.dragPan.enable();
        }
      };
    } else {
      // Make sure panning is enabled in idle state
      if (map.current && !map.current.dragPan.isEnabled()) {
        map.current.dragPan.enable();
      }
    }
  }, [isMapLoaded, placementState, selectedPoint]);

  // Update map state when camera changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Handle map movement - only update sun marker position
    const handleMapMove = () => {
      if (!map.current) return;

      // Update sun marker position when map moves (if visible)
      if (showSunMarker && sunMarker.current && sunPosition) {
        sunMarker.current.updatePosition(sunPosition, map.current.getCenter());
      }
    };

    // Handle map movement end - update map state
    const handleMapMoveEnd = () => {
      if (!map.current) return;

      const center = map.current.getCenter();
      setLng(parseFloat(center.lng.toFixed(4)));
      setLat(parseFloat(center.lat.toFixed(4)));
      setZoom(parseFloat(map.current.getZoom().toFixed(2)));
      setPitch(parseFloat(map.current.getPitch().toFixed(2)));
      setBearing(parseFloat(map.current.getBearing().toFixed(2)));
    };

    // Add both event listeners
    map.current.on("move", handleMapMove);
    map.current.on("moveend", handleMapMoveEnd);

    // Clean up both event listeners
    return () => {
      map.current?.off("move", handleMapMove);
      map.current?.off("moveend", handleMapMoveEnd);
    };
  }, [isMapLoaded, showSunMarker, sunPosition]);

  // When currentTime changes, update the sun position and shadows
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Update sun position
    const newSunPosition = getSunPosition(currentTime, lat, lng);
    setSunPosition(newSunPosition);

    // Update lighting using the new setLights method
    const { ambient, directional } = sunPositionToMapboxLight(newSunPosition);
    
    try {
      // For night time (sun below horizon), only use ambient light
      if (newSunPosition.altitudeDegrees <= 0) {
        map.current.setLights([
          {
            id: 'ambient-light',
            type: 'ambient',
            properties: {
              color: ambient.color,
              intensity: ambient.intensity
            }
          } as any
        ]);
      } else {
        // For daytime, use both ambient and directional lights
        map.current.setLights([
          {
            id: 'ambient-light',
            type: 'ambient',
            properties: {
              color: ambient.color,
              intensity: ambient.intensity
            }
          } as any,
          {
            id: 'directional-light',
            type: 'directional',
            properties: {
              color: directional.color,
              intensity: directional.intensity,
              direction: directional.direction
            }
          } as any
        ]);
      }
    } catch (error) {
      console.error('Error setting lights:', error);
    }

    // Update sun marker if visible
    if (showSunMarker && sunMarker.current) {
      sunMarker.current.updatePosition(newSunPosition, map.current.getCenter());
    }

    // Camera orientation handled below within ray-tracing update for consistent behavior

    // Update ray tracing for the selected point when time changes
    if (
      selectedPoint &&
      map.current &&
      map.current.getSource("ray-source") &&
      map.current.getSource("ray-segments-source")
    ) {
      try {
        // Get new sun position for the selected point
        const pointSunPosition = getSunPosition(
          currentTime,
          selectedPoint.latitude,
          selectedPoint.longitude
        );

        if (pointSunPosition.altitude > 0) {
          // Calculate updated ray path using 3D positioning
          const rayEnd = calculate3DDestinationPoint(
            [selectedPoint.longitude, selectedPoint.latitude],
            1.0, // 1km distance
            pointSunPosition.azimuthDegrees,
            pointSunPosition.altitudeDegrees
          );

          // Check if point is in sunlight with updated sun position
          const shadowResult = isPointInSunlightWithShadows(
            map.current,
            [selectedPoint.longitude, selectedPoint.latitude],
            pointSunPosition
          );

          const isInSunlight = shadowResult.inSunlight;

          // Update 2D ray feature for fallback
          const rayFeature: Feature<LineString, GeoJsonProperties> = {
            type: "Feature",
            properties: {
              altitude: pointSunPosition.altitudeDegrees,
              azimuth: pointSunPosition.azimuthDegrees,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [selectedPoint.longitude, selectedPoint.latitude],
                [rayEnd.position[0], rayEnd.position[1]],
              ],
            },
          };

          // Update the ray visualization for 2D fallback
          (
            map.current.getSource("ray-source") as mapboxgl.GeoJSONSource
          ).setData({
            type: "FeatureCollection",
            features: [rayFeature],
          });

          // Generate 3D segments for the ray with more segments for smoothness
          const raySegments = createRay3DSegments(
            map.current,
            [selectedPoint.longitude, selectedPoint.latitude],
            rayEnd.position,
            0, // Start at ground level
            rayEnd.elevation, // End at calculated elevation
            30 // Increased from 20 to 30 segments for smoother appearance
          );

          // Update the ray segments source
          (
            map.current.getSource(
              "ray-segments-source"
            ) as mapboxgl.GeoJSONSource
          ).setData({
            type: "FeatureCollection",
            features: raySegments,
          });

          // Update the ray color based on sunlight status
          const rayColor = isInSunlight ? "#FFDD00" : "#3F51B5";
          map.current.setPaintProperty(
            "ray-layer",
            "fill-extrusion-color",
            rayColor
          );
          map.current.setPaintProperty(
            "ray-path-layer",
            "line-color",
            rayColor
          );

          // Update line dash pattern
          map.current.setPaintProperty(
            "ray-path-layer",
            "line-dasharray",
            isInSunlight ? [2, 2] : [1, 1]
          );

          // Adjust camera to a fixed bearing: midpoint between sunrise and sunset azimuths
          try {
            const currentZoom = map.current.getZoom();
            const zoomTarget = currentZoom; // keep zoom unchanged
            // Compute sunrise and sunset azimuths, then take midpoint
            const times = getSunTimes(currentTime, selectedPoint.latitude, selectedPoint.longitude);
            const sunrisePos = getSunPosition(times.sunrise, selectedPoint.latitude, selectedPoint.longitude);
            const sunsetPos = getSunPosition(times.sunset, selectedPoint.latitude, selectedPoint.longitude);
            const az1 = (sunrisePos.azimuthDegrees + 360) % 360;
            const az2 = (sunsetPos.azimuthDegrees + 360) % 360;
            let delta = ((az2 - az1 + 540) % 360) - 180; // shortest arc [-180,180)
            const midpoint = (az1 + delta / 2 + 360) % 360;
            // Point opposite to midpoint so camera faces the ray direction
            const bearingTarget = midpoint % 360;
            const pitchTarget = Math.max(30, Math.min(75, 75 - pointSunPosition.altitudeDegrees * 0.5));
            suppressCameraEventsRef.current = true;
            map.current.easeTo({
              zoom: zoomTarget,
              bearing: bearingTarget,
              pitch: pitchTarget,
              duration: 250,
            });
            setTimeout(() => { suppressCameraEventsRef.current = false; }, 0);
          } catch {
            suppressCameraEventsRef.current = false;
          }

          // Update the marker if needed
          if (isInSunlight !== selectedPoint.isInSunlight) {
            // Update marker style
            if (selectedPoint.marker) {
              // Remove old marker
              selectedPoint.marker.remove();
              
              // Create new marker element with updated style
              const markerElement = document.createElement('div');
              markerElement.className = isInSunlight ? 'placed-marker sunlight' : 'placed-marker shadow';
              markerElement.innerHTML = `
                <div class="placed-marker-icon">
                  <div class="placed-marker-pin"></div>
                  <div class="placed-marker-point"></div>
                  <div class="placed-marker-pulse"></div>
                </div>
              `;
              
              // Create new marker
              const newMarker = new mapboxgl.Marker({
                element: markerElement,
                anchor: 'bottom',
              })
                .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
                .addTo(map.current);
              
              // Update selected point with new marker and status
              setSelectedPoint({
                ...selectedPoint,
                marker: newMarker,
                isInSunlight,
              });
            }
          }
        } else {
          // Sun below horizon - clear ray and update point status if needed
          (
            map.current.getSource("ray-source") as mapboxgl.GeoJSONSource
          ).setData({
            type: "FeatureCollection",
            features: [],
          });

          // Also clear 3D ray segments
          (
            map.current.getSource(
              "ray-segments-source"
            ) as mapboxgl.GeoJSONSource
          ).setData({
            type: "FeatureCollection",
            features: [],
          });

          if (selectedPoint.isInSunlight) {
            // Update marker to shadow state
            if (selectedPoint.marker) {
              selectedPoint.marker.remove();
              
              // Create new marker element with shadow style
              const markerElement = document.createElement('div');
              markerElement.className = 'placed-marker shadow';
              markerElement.innerHTML = `
                <div class="placed-marker-icon">
                  <div class="placed-marker-pin"></div>
                  <div class="placed-marker-point"></div>
                  <div class="placed-marker-pulse"></div>
                </div>
              `;
              
              const newMarker = new mapboxgl.Marker({
                element: markerElement,
                anchor: 'bottom',
              })
                .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
                .addTo(map.current);

              // Update selected point
              setSelectedPoint({
                ...selectedPoint,
                marker: newMarker,
                isInSunlight: false,
              });
            }
          }
        }
      } catch (error) {
        console.error("Error updating ray tracing with time change:", error);
      }
    }
  }, [
    currentTime,
    isMapLoaded,
    lat,
    lng,
    showSunMarker,
    selectedPoint,
  ]);

  // Handle search result
  const handleSearchResult = (lat: number, lng: number) => {
    if (!map.current) return;
    
    // Reset to idle state if we were in placed state
    if (placementState === 'placed') {
      setPlacementState('idle');
    }

    // Clear any previously selected point
    if (selectedPoint && selectedPoint.marker) {
      selectedPoint.marker.remove();
      setSelectedPoint(null);
    }

    // If we have a location select handler, call it
    if (onLocationSelect) {
      onLocationSelect(lat, lng);
    }
  };
  
  // Function to handle "Check" button click
  const handleCheckButtonClick = () => {
    if (!map.current) return;
    
    // Get the current center of the map (where the center marker is)
    const center = map.current.getCenter();
    
    // Remove previous marker if any
    if (selectedPoint && selectedPoint.marker) {
      selectedPoint.marker.remove();
    }
    
    // Clear any existing ray visualization
    if (map.current.getSource("ray-source")) {
      (map.current.getSource("ray-source") as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
    
    const clickedPoint: [number, number] = [center.lng, center.lat];
    
    // Get sun position for the clicked location
    const pointSunPosition = getSunPosition(currentTime, center.lat, center.lng);
    
    // Determine if the point is in sunlight
    let isInSunlight = false;
    
    if (pointSunPosition.altitude > 0) {
      try {
        const shadowResult = isPointInSunlightWithShadows(
          map.current,
          clickedPoint,
          pointSunPosition
        );
        
        isInSunlight = shadowResult.inSunlight;
        setSelectedPointShadowStatus(!isInSunlight);
      } catch (error) {
        console.error("Error in shadow calculation:", error);
        setMapError("Shadow calculation failed. Using simplified method instead.");
        isInSunlight = isPointInSunlight(pointSunPosition);
        setSelectedPointShadowStatus(!isInSunlight);
      }
    } else {
      isInSunlight = false;
      setSelectedPointShadowStatus(true);
    }
    
    // Create a custom marker element for better styling
    const markerElement = document.createElement('div');
    markerElement.className = isInSunlight ? 'placed-marker sunlight' : 'placed-marker shadow';
    markerElement.innerHTML = `
      <div class="placed-marker-icon">
        <div class="placed-marker-pin"></div>
        <div class="placed-marker-point"></div>
        <div class="placed-marker-pulse"></div>
      </div>
    `;
    
    // Create a marker at the clicked point with the custom element
    const marker = new mapboxgl.Marker({
      element: markerElement,
      anchor: 'bottom',
    })
      .setLngLat(center)
      .addTo(map.current);
    
    // Update the selected point
    setSelectedPoint({
      latitude: center.lat,
      longitude: center.lng,
      isInSunlight,
      marker,
    });
    
    // Visualize ray path
    if (map.current.getSource("ray-source") && map.current.getSource("ray-segments-source")) {
      if (pointSunPosition.altitude > 0) {
        const rayEnd = calculate3DDestinationPoint(
          [center.lng, center.lat],
          1.0,
          pointSunPosition.azimuthDegrees,
          pointSunPosition.altitudeDegrees
        );
        
        // Create ray feature
        const rayFeature: Feature<LineString, GeoJsonProperties> = {
          type: "Feature",
          properties: {
            altitude: pointSunPosition.altitudeDegrees,
            azimuth: pointSunPosition.azimuthDegrees,
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [center.lng, center.lat],
              [rayEnd.position[0], rayEnd.position[1]],
            ],
          },
        };
        
        // Update the ray source
        (map.current.getSource("ray-source") as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: [rayFeature],
        });
        
        // Generate 3D segments
        const raySegments = createRay3DSegments(
          map.current,
          [center.lng, center.lat],
          rayEnd.position,
          0,
          rayEnd.elevation,
          30
        );
        
        // Update segments source
        (map.current.getSource("ray-segments-source") as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: raySegments,
        });
        
        // Update colors
        const rayColor = isInSunlight ? "#FFDD00" : "#3F51B5";
        map.current.setPaintProperty("ray-layer", "fill-extrusion-color", rayColor);
        map.current.setPaintProperty("ray-path-layer", "line-color", rayColor);
        map.current.setPaintProperty(
          "ray-path-layer",
          "line-dasharray",
          isInSunlight ? [2, 2] : [1, 1]
        );
      }
    }
    
    // Change to placed state
    setPlacementState('placed');
    
    // Notify parent with the selected location
    if (onLocationSelect) {
      onLocationSelect(center.lat, center.lng);
    }
  };
  
  // Function to handle "Reset" button click
  const handleResetButtonClick = () => {
    // Reset to idle state
    setPlacementState('idle');
    
    // Clear the selected point and ray
    if (selectedPoint && selectedPoint.marker) {
      selectedPoint.marker.remove();
      setSelectedPoint(null);
    }
    
    // Clear ray visualizations
    if (map.current && map.current.getSource("ray-source")) {
      (map.current.getSource("ray-source") as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
      
      (map.current.getSource("ray-segments-source") as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  };

  // Dismiss error handler
  const handleDismissError = () => {
    setMapError(null);
  };

  return (
    <div
      className="map-container"
      ref={mapContainer}
    >
      {/* Add SearchBox component only when map is loaded */}
      {isMapLoaded && map.current && (
        <SearchBoxWrapper 
          map={map.current} 
          onLocationSelect={handleSearchResult}
          className="search-box-wrapper"
        />
      )}
      
      {/* Map controls */}
      {isMapLoaded && map.current && (
        <MapControls
          map={map.current}
          placementState={placementState}
          selectedPoint={selectedPoint}
          onCheckLocation={handleCheckButtonClick}
          onResetLocation={handleResetButtonClick}
          error={mapError}
          onDismissError={handleDismissError}
          isZoomSufficient={isZoomSufficient}
        />
      )}
      
      {/* Time slider - only show when in placed state and onTimeChange is provided */}
      {isMapLoaded && placementState === 'placed' && selectedPoint && onTimeChange && (
        <div className="map-time-slider">
          <TimeSlider 
            date={currentTime}
            latitude={selectedPoint.latitude}
            longitude={selectedPoint.longitude}
            onTimeChange={onTimeChange}
          />
        </div>
      )}
    </div>
  );
};

export default Map; 