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
      
      {/* Check button in idle state */}
      {placementState === 'idle' && (
        <button 
          className="check-button"
          onClick={onCheckLocation}
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
          onClick={onResetLocation}
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
    </>
  );
};

export default MapControls; 