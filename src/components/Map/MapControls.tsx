import React from 'react';
import mapboxgl from 'mapbox-gl';
import { PlacementState, SelectedPoint } from './types';

interface MapControlsProps {
  map: mapboxgl.Map;
  placementState: PlacementState;
  selectedPoint: SelectedPoint | null;
  onCheckLocation: () => void;
  onResetLocation: () => void;
  error: string | null;
  onDismissError: () => void;
  isZoomSufficient: boolean;
}

const MapControls: React.FC<MapControlsProps> = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  map,
  placementState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedPoint,
  onCheckLocation,
  onResetLocation,
  error,
  onDismissError,
  isZoomSufficient,
}) => {
  return (
    <>
      {/* Map error message */}
      {error && (
        <div className="map-error">
          <p>{error}</p>
          <button onClick={onDismissError}>Dismiss</button>
        </div>
      )}
      
      {/* Check button in idle state (only above zoom threshold) */}
      {placementState === 'idle' && isZoomSufficient && (
        <div className="map-control-button-container">
          <button 
            className="check-button"
            onClick={onCheckLocation}
          >
            Check This Location
          </button>
        </div>
      )}
      
      {/* Reset button in placed state */}
      {placementState === 'placed' && (
        <div className="map-control-button-container">
          <button 
            className="reset-button"
            onClick={onResetLocation}
          >
            Reset
          </button>
        </div>
      )}
    </>
  );
};

export default MapControls; 