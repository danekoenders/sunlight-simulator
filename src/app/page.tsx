'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Import the map component dynamically to avoid SSR issues
const DynamicMap = dynamic(
  () => import('../components/DynamicMap'),
  { ssr: false }
);

export default function AppPage() {
  // State for current time (default to current date/time)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Default location (Rotterdam, Netherlands)
  const [mapLocation, setMapLocation] = useState({
    latitude: 51.9244,
    longitude: 4.4626
  });
  
  // Handler for time slider changes
  const handleTimeChange = (newTime: Date) => {
    setCurrentTime(newTime);
  };
  
  // Handler for location selection on map
  const handleLocationSelect = (lat: number, lng: number) => {
    // Update mapLocation when a location is selected on the map
    setMapLocation({
      latitude: lat,
      longitude: lng
    });
    
    console.log('Location selected:', lat, lng);
  };

  return (
    <main className="app-container">
      <div className="app-content">
        <div className="map-section">
          <DynamicMap 
            currentTime={currentTime} 
            onLocationSelect={handleLocationSelect}
            lat={mapLocation.latitude}
            lng={mapLocation.longitude}
            zoom={16}
            time={currentTime}
            onTimeChange={handleTimeChange}
          />
        </div>
      </div>
    </main>
  );
}
