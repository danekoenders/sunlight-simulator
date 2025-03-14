import mapboxgl from "mapbox-gl";

// Define the map props
export interface MapProps {
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
export type PlacementState = 'idle' | 'placed';

export interface SelectedPoint {
  latitude: number;
  longitude: number;
  isInSunlight: boolean;
  marker?: mapboxgl.Marker;
}

// For ray tracing
export interface Ray3DPoint {
  position: [number, number];
  elevation: number;
} 