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
import { SearchBox } from '@mapbox/search-js-react';
import { SearchBoxRetrieveResponse } from '@mapbox/search-js-core';
import '@mapbox/search-js-web';
import {
  getSunPosition,
  sunPositionToMapboxLight,
  isPointInSunlight,
  isPointInSunlightWithShadows,
  SunPosition,
} from "../lib/sunUtils";
import * as turf from "@turf/turf";
import { Feature, LineString, GeoJsonProperties } from "geojson";

interface MapProps {
  currentTime: Date;
  onLocationSelect?: (lat: number, lng: number) => void;
  onMapLoad?: () => void;
  lat?: number;
  lng?: number;
  zoom?: number;
  time?: Date;
  onPlacementStateChange?: (isPlaced: boolean) => void;
}

// Define the placement states
type PlacementState = 'idle' | 'placed';

interface SelectedPoint {
  latitude: number;
  longitude: number;
  isInSunlight: boolean;
  marker?: mapboxgl.Marker;
}

// Simplified sun visualization using HTML/CSS instead of Three.js for better performance
class SunMarker {
  private marker: mapboxgl.Marker;
  private sunElement: HTMLDivElement;
  private beamElement: HTMLDivElement | null = null;
  private map: mapboxgl.Map | null = null;
  private selectedPoint: mapboxgl.LngLat | null = null;

  constructor() {
    // Create sun element
    this.sunElement = document.createElement("div");
    this.sunElement.className = "sun-marker";
    this.sunElement.innerHTML = `
      <div class="sun-circle"></div>
      <div class="sun-glow"></div>
    `;

    // Create marker with the sun element
    this.marker = new mapboxgl.Marker({
      element: this.sunElement,
      anchor: "center",
      offset: [0, 0],
      rotation: 0,
      // Important for performance: reduce drag impact
      draggable: false,
      // Important for performance: don't pitch with map
      pitchAlignment: "viewport",
      // Important for performance: don't rotate with map
      rotationAlignment: "viewport",
    });
  }

  addTo(map: mapboxgl.Map): this {
    this.map = map;
    return this;
  }

  updatePosition(sunPosition: SunPosition, mapCenter: mapboxgl.LngLat): this {
    if (!this.map) return this;

    // Hide the sun if it's below the horizon
    if (sunPosition.altitude <= 0) {
      this.sunElement.style.display = "none";
      if (this.beamElement) {
        this.beamElement.style.display = "none";
      }
      return this;
    }

    // Show the sun if it's above the horizon
    this.sunElement.style.display = "block";

    // Get map bounds
    const bounds = this.map.getBounds();
    if (!bounds) {
      console.error("Could not get map bounds");
      return this;
    }

    const mapWidth = bounds.getEast() - bounds.getWest();
    const mapHeight = bounds.getNorth() - bounds.getSouth();

    // Calculate realistic sun position based on altitude and azimuth
    // Since the sun is effectively infinitely far away, we calculate a position
    // at the edge of the view field in the correct direction

    // Convert altitude to a normalized value (0-1) for position scaling
    // This ensures sun is still visible when low on horizon
    const altitudeFactor = Math.sin(sunPosition.altitude);

    // Calculate the direction vector toward the sun
    const directionX =
      Math.sin(sunPosition.azimuth) * Math.cos(sunPosition.altitude);
    const directionY =
      Math.cos(sunPosition.azimuth) * Math.cos(sunPosition.altitude);

    // Calculate a distance factor that places the sun just inside the map view
    // First get the current map canvas dimensions
    const mapCanvas = this.map.getCanvas();
    const canvasWidth = mapCanvas.width;
    const canvasHeight = mapCanvas.height;

    // Calculate the position vector magnitude needed to reach the edge of view
    const mapCenterViewport = this.map.project(mapCenter);
    const edge = Math.min(canvasWidth, canvasHeight) * 0.45; // Use 45% of the smaller dimension

    // Calculate new LngLat based on the sun direction but constrained to the edge distance
    const newLng = mapCenter.lng + directionX * mapWidth * 0.5;
    const newLat = mapCenter.lat + directionY * mapHeight * 0.5;

    // Set marker position
    this.marker.setLngLat([newLng, newLat]);
    this.marker.addTo(this.map);

    // Change sun color and size based on altitude
    const sunCircle = this.sunElement.querySelector(
      ".sun-circle"
    ) as HTMLElement;
    const sunGlow = this.sunElement.querySelector(".sun-glow") as HTMLElement;

    if (sunPosition.altitude < 0.1) {
      // Sunrise/sunset
      sunCircle.style.backgroundColor = "#FF8C00";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 140, 0, 0.7)";

      // Make sun slightly larger at sunrise/sunset for visual effect
      sunCircle.style.width = "24px";
      sunCircle.style.height = "24px";
      sunGlow.style.width = "24px";
      sunGlow.style.height = "24px";
    } else if (sunPosition.altitude < 0.3) {
      // Morning/evening
      sunCircle.style.backgroundColor = "#FFD700";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 215, 0, 0.6)";

      // Normal size
      sunCircle.style.width = "20px";
      sunCircle.style.height = "20px";
      sunGlow.style.width = "20px";
      sunGlow.style.height = "20px";
    } else {
      // Midday
      sunCircle.style.backgroundColor = "#FFFF00";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 255, 0, 0.5)";

      // Normal size
      sunCircle.style.width = "20px";
      sunCircle.style.height = "20px";
      sunGlow.style.width = "20px";
      sunGlow.style.height = "20px";
    }

    // Update beam if we have a selected point
    this.updateBeam();

    return this;
  }

  setSelectedPoint(lngLat: mapboxgl.LngLat | null): this {
    this.selectedPoint = lngLat;
    this.updateBeam();
    return this;
  }

  private updateBeam(): void {
    if (!this.map || !this.selectedPoint) {
      if (this.beamElement) {
        this.beamElement.style.display = "none";
      }
      return;
    }

    // Create beam element if it doesn't exist
    if (!this.beamElement) {
      this.beamElement = document.createElement("div");
      this.beamElement.className = "sun-beam";
      this.map.getCanvasContainer().appendChild(this.beamElement);
    }

    const sunPosition = this.marker.getLngLat();
    const mapCanvas = this.map.getCanvas();

    // Convert geographical positions to pixel positions
    const sunPixel = this.map.project(sunPosition);
    const pointPixel = this.map.project(this.selectedPoint);

    // Calculate beam dimensions and position
    const length = Math.sqrt(
      Math.pow(sunPixel.x - pointPixel.x, 2) +
        Math.pow(sunPixel.y - pointPixel.y, 2)
    );

    // Calculate angle
    const angle =
      Math.atan2(pointPixel.y - sunPixel.y, pointPixel.x - sunPixel.x) *
      (180 / Math.PI);

    // Position and size beam
    this.beamElement.style.display = "block";
    this.beamElement.style.width = `${length}px`;
    this.beamElement.style.height = "2px";
    this.beamElement.style.left = `${sunPixel.x}px`;
    this.beamElement.style.top = `${sunPixel.y}px`;
    this.beamElement.style.transformOrigin = "0 0";
    this.beamElement.style.transform = `rotate(${angle}deg)`;
  }

  remove(): void {
    this.marker.remove();
    if (this.beamElement && this.beamElement.parentNode) {
      this.beamElement.parentNode.removeChild(this.beamElement);
    }
    this.beamElement = null;
  }
}

// Update the calculate3DDestinationPoint function to return elevation as well
const calculate3DDestinationPoint = (
  startPoint: [number, number], // [lng, lat]
  distance: number, // in kilometers
  azimuthDegrees: number,
  altitudeDegrees: number
): {
  position: [number, number];
  elevation: number;
} => {
  // Convert altitude to radians
  const altitudeRadians = (altitudeDegrees * Math.PI) / 180;

  // Adjust the distance based on the altitude angle
  // When altitude is 90° (directly overhead), horizontal distance is 0
  // When altitude is 0° (horizon), horizontal distance is the full distance
  const horizontalDistance = distance * Math.cos(altitudeRadians);

  // Calculate the vertical component of the ray
  // When altitude is 90° (directly overhead), vertical distance is the full distance
  // When altitude is 0° (horizon), vertical distance is 0
  const verticalDistance = distance * Math.sin(altitudeRadians);

  // Invert azimuth for ray tracing (from ground to sun)
  const inverseBearing = (azimuthDegrees + 180) % 360;

  // Calculate the destination point using the horizontal distance
  const destination = turf.destination(
    startPoint,
    horizontalDistance,
    inverseBearing,
    { units: "kilometers" }
  );

  // Ensure we return exactly [number, number] by extracting the coordinates
  const [lng, lat] = destination.geometry.coordinates;

  return {
    position: [lng, lat],
    elevation: verticalDistance * 1000, // Convert to meters for Mapbox elevation scale
  };
};

const Map: React.FC<MapProps> = ({
  onMapLoad,
  onLocationSelect,
  lat: initialLat = 51.9244,
  lng: initialLng = 4.4626,
  zoom: initialZoom = 16,
  time,
  currentTime,
  onPlacementStateChange,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const sunMarker = useRef<SunMarker | null>(null);

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

    // Add navigation controls to the map
    initializedMap.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Wait for map to be fully loaded
    initializedMap.on("load", () => {
      setIsMapLoaded(true);

      // Create the center marker once the map is loaded
      const element = document.createElement('div');
      element.className = 'center-marker';
      element.innerHTML = `
        <div class="center-marker-icon"></div>
        <div class="center-marker-text">Move map to select a point</div>
      `;

      const marker = new mapboxgl.Marker({
        element,
        anchor: 'bottom',
      })
        .setLngLat(initializedMap.getCenter())
        .addTo(initializedMap);
        
      setCenterMarker(marker);

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

    // Clean up on unmount
    return () => {
      if (requestAnimationFrameId.current) {
        cancelAnimationFrame(requestAnimationFrameId.current);
      }
      if (sunMarker.current) {
        sunMarker.current.remove();
      }
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
    
    // Update the center marker visibility based on placement state
    if (centerMarker) {
      const markerElement = centerMarker.getElement();
      if (placementState === 'idle') {
        markerElement.style.display = 'block';
      } else {
        markerElement.style.display = 'none';
      }
    }

    // Set up camera behavior for placed state
    if (map.current && isMapLoaded) {
      if (placementState === 'placed' && selectedPoint) {
        // Disable map panning but allow rotation and zoom
        // Save the current center
        const placedCenter = new mapboxgl.LngLat(
          selectedPoint.longitude, 
          selectedPoint.latitude
        );
        
        // Add camera handler to keep the marker in center
        const handleMoveEnd = () => {
          if (map.current && placementState === 'placed' && selectedPoint) {
            // After any camera movement, reset to the placed point
            map.current.easeTo({
              center: [selectedPoint.longitude, selectedPoint.latitude],
              duration: 300,
            });
          }
        };
        
        // Add event listener
        map.current.on('moveend', handleMoveEnd);
        
        // Clean up
        return () => {
          map.current?.off('moveend', handleMoveEnd);
        };
      }
    }
  }, [placementState, centerMarker, onPlacementStateChange, isMapLoaded, selectedPoint]);

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
      
      // Position will be fixed, but we'll check if user tries to change it
      let isDragging = false;
      
      // Track if we're handling a move already to prevent recursive calls
      let isHandlingMove = false;
      
      // Create a smart move handler that won't cause infinite recursion
      const handleMove = () => {
        if (!map.current || isHandlingMove) return;
        
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
      
      // This is triggered after rotation/zoom gestures end
      const handleMoveEnd = () => {
        if (!map.current) return;
        
        // Make sure we're at the correct center
        // Get current center
        const currentCenter = map.current.getCenter();
        
        // Check if center has moved
        const hasMoved = 
          Math.abs(currentCenter.lng - center[0]) > 0.0001 || 
          Math.abs(currentCenter.lat - center[1]) > 0.0001;
          
        if (hasMoved) {
          // Restore center with animation
          map.current.easeTo({
            center: center,
            duration: 300
          });
        }
      };
      
      // Add event listeners
      map.current.on('move', handleMove);
      map.current.on('moveend', handleMoveEnd);
      
      // Clean up
      return () => {
        if (!map.current) return;
        
        // Remove event listeners
        map.current.off('move', handleMove);
        map.current.off('moveend', handleMoveEnd);
        
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

          // Update the marker if needed
          if (isInSunlight !== selectedPoint.isInSunlight) {
            // Update marker color
            if (selectedPoint.marker) {
              selectedPoint.marker.remove();
              const newMarker = new mapboxgl.Marker({
                color: isInSunlight ? "#FFDD00" : "#3F51B5",
              })
                .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
                .addTo(map.current);
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
              const newMarker = new mapboxgl.Marker({ color: "#3F51B5" })
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

  // Modified handleSearchResult to not automatically place a marker
  const handleSearchResult = (result: SearchBoxRetrieveResponse) => {
    if (!map.current || !result || !result.features || result.features.length === 0) return;
    
    // Get the coordinates from the first feature
    const [lng, lat] = result.features[0].geometry.coordinates;
    
    // Fly to the location (but don't place a marker yet)
    map.current.flyTo({
      center: [lng, lat],
      zoom: 16,
      duration: 2000
    });

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
    
    // Create a marker at the clicked point
    const markerColor = isInSunlight ? "#FFDD00" : "#3F51B5";
    const marker = new mapboxgl.Marker({ color: markerColor })
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

  // Only render SearchBox when map is loaded
  const renderSearchBox = () => {
    if (!map.current) return null;

    return (
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1 }}>
        {/* @ts-ignore */}
        <SearchBox
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""}
          onRetrieve={handleSearchResult}
          placeholder="Search for a location..."
          value=""
          map={map.current}
          marker={false} // Don't show the search marker
          mapboxgl={mapboxgl}
        />
      </div>
    );
  };

  return (
    <div
      className="map-container"
      ref={mapContainer}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Add SearchBox component only when map is loaded */}
      {renderSearchBox()}
      
      {/* Map error message */}
      {mapError && (
        <div className="map-error">
          <p>{mapError}</p>
          <button onClick={() => setMapError(null)}>Dismiss</button>
        </div>
      )}
      
      {/* Check button in idle state */}
      {placementState === 'idle' && isMapLoaded && (
        <button 
          className="check-button"
          onClick={handleCheckButtonClick}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            zIndex: 2
          }}
        >
          Check This Location
        </button>
      )}
      
      {/* Reset button in placed state */}
      {placementState === 'placed' && (
        <button 
          className="reset-button"
          onClick={handleResetButtonClick}
          style={{
            position: 'absolute',
            top: '10px',
            right: '60px',
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            zIndex: 2
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
};

// Add helper function to create small ray segments for 3D visualization
function createRay3DSegments(
  map: mapboxgl.Map,
  start: [number, number],
  end: [number, number],
  startElevation: number,
  endElevation: number,
  segments: number = 20
): Feature[] {
  const features: Feature[] = [];

  // Create multiple segments to form a 3D ray
  for (let i = 0; i < segments; i++) {
    const ratio1 = i / segments;
    const ratio2 = (i + 1) / segments;

    // Interpolate positions
    const lng1 = start[0] + (end[0] - start[0]) * ratio1;
    const lat1 = start[1] + (end[1] - start[1]) * ratio1;
    const elev1 = startElevation + (endElevation - startElevation) * ratio1;

    const lng2 = start[0] + (end[0] - start[0]) * ratio2;
    const lat2 = start[1] + (end[1] - start[1]) * ratio2;
    const elev2 = startElevation + (endElevation - startElevation) * ratio2;

    // Calculate a small rectangle around the line segment for extrusion
    const angle = Math.atan2(lat2 - lat1, lng2 - lng1);
    const perpAngle = angle + Math.PI / 2;

    // Width of the ray (in meters, converted to degrees)
    const widthMeters = 0.2;
    const widthDegrees =
      widthMeters / (111320 * Math.cos((lat1 * Math.PI) / 180));

    // Calculate corners of the rectangle
    const dx = (widthDegrees * Math.cos(perpAngle)) / 2;
    const dy = (widthDegrees * Math.sin(perpAngle)) / 2;

    // Create a polygon for this segment
    const segment: Feature = {
      type: "Feature",
      properties: {
        base: elev1,
        height: elev2,
        segment: i,
        isRaySegment: true,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [lng1 - dx, lat1 - dy],
            [lng1 + dx, lat1 + dy],
            [lng2 + dx, lat2 + dy],
            [lng2 - dx, lat2 - dy],
            [lng1 - dx, lat1 - dy],
          ],
        ],
      },
    };

    features.push(segment);
  }

  return features;
}

export default Map;
