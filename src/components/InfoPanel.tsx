import React from 'react';
import { SunPosition } from '../lib/sunUtils';

interface InfoPanelProps {
  sunPosition: SunPosition | null;
  selectedLocation: {
    latitude: number;
    longitude: number;
    isInSunlight: boolean;
  } | null;
  currentTime: Date;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ 
  sunPosition, 
  selectedLocation, 
  currentTime 
}) => {
  if (!sunPosition) {
    return <div className="info-panel">Loading sun position data...</div>;
  }

  return (
    <div className="info-panel">
      <h2>Sun Position</h2>
      <div className="sun-details">
        <div className="info-row">
          <span className="info-label">Current Time:</span>
          <span className="info-value">{currentTime.toLocaleTimeString()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Date:</span>
          <span className="info-value">{currentTime.toLocaleDateString()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Sun Altitude:</span>
          <span className="info-value">{sunPosition.altitudeDegrees.toFixed(2)}°</span>
        </div>
        <div className="info-row">
          <span className="info-label">Sun Azimuth:</span>
          <span className="info-value">{sunPosition.azimuthDegrees.toFixed(2)}°</span>
        </div>
        <div className="info-row">
          <span className="info-label">Sun Status:</span>
          <span className="info-value">
            {sunPosition.altitudeDegrees > 0 ? 
              <span className="sun-above">Above Horizon</span> : 
              <span className="sun-below">Below Horizon</span>}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Sun Direction:</span>
          <span className="info-value">
            {getCardinalDirection(sunPosition.azimuthDegrees)}
          </span>
        </div>
      </div>
      
      {selectedLocation && (
        <>
          <h2>Selected Location</h2>
          <div className="location-details">
            <div className="info-row">
              <span className="info-label">Latitude:</span>
              <span className="info-value">{selectedLocation.latitude.toFixed(4)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Longitude:</span>
              <span className="info-value">{selectedLocation.longitude.toFixed(4)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Sunlight Status:</span>
              <span className={`info-value ${selectedLocation.isInSunlight ? 'in-sun' : 'in-shadow'}`}>
                {selectedLocation.isInSunlight ? 'In Direct Sunlight' : 'In Shadow'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Detection Method:</span>
              <span className="info-value">Ray Tracing</span>
            </div>
          </div>
        </>
      )}
      
      <div className="instructions">
        <h3>How to Use</h3>
        <p>Use the time slider to change the time of day. Click on the map to select a location and see if it's in direct sunlight or shadow.</p>
        <p>The 3D buildings show how shadows are cast by structures. Zoom in for more detail.</p>
        <p>The yellow sphere represents the sun's position in the sky. When you select a point, a beam will connect from the sun to your selected location, showing the sun's direct path.</p>
        <p>Our advanced ray tracing technology checks if any buildings are blocking the sunlight to give you accurate shadow information.</p>
      </div>
    </div>
  );
};

// Helper function to convert azimuth angle to cardinal direction
function getCardinalDirection(azimuth: number): string {
  // Normalize azimuth to 0-360 range
  const normalized = (azimuth + 360) % 360;
  
  // Define direction boundaries (N is 0/360, E is 90, S is 180, W is 270)
  const directions = [
    { name: 'North', min: 337.5, max: 22.5 },
    { name: 'Northeast', min: 22.5, max: 67.5 },
    { name: 'East', min: 67.5, max: 112.5 },
    { name: 'Southeast', min: 112.5, max: 157.5 },
    { name: 'South', min: 157.5, max: 202.5 },
    { name: 'Southwest', min: 202.5, max: 247.5 },
    { name: 'West', min: 247.5, max: 292.5 },
    { name: 'Northwest', min: 292.5, max: 337.5 }
  ];
  
  // Handle the special case for North (which wraps around 0/360)
  if (normalized >= 337.5 || normalized < 22.5) {
    return 'North';
  }
  
  // Find the matching direction
  for (const dir of directions) {
    if (normalized >= dir.min && normalized < dir.max) {
      return dir.name;
    }
  }
  
  return 'Unknown'; // Fallback (should never reach here)
}

export default InfoPanel; 