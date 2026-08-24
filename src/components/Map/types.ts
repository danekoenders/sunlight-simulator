export interface MapProps {
  currentTime: Date;
  lat?: number;
  lng?: number;
  zoom?: number;
  /** Measure the opening centre as soon as the map settles (shared links). */
  autoCheck?: boolean;
  onMapLoad?: () => void;
  onTimeChange?: (newTime: Date) => void;
  /** Reports the measured spot so the URL can carry it. */
  onSpotChange?: (spot: { lat: number; lng: number } | null) => void;
}

export type PlacementState = 'idle' | 'placed';

export interface SelectedPoint {
  latitude: number;
  longitude: number;
  isInSunlight: boolean;
}

// For ray tracing
export interface Ray3DPoint {
  position: [number, number];
  elevation: number;
}
