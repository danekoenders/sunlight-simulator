'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import TimeSlider from '../components/TimeSlider';

// Import the map component dynamically to avoid SSR issues
const DynamicMap = dynamic(
  () => import('../components/DynamicMap'),
  { ssr: false }
);

export default function Home() {
  // State for current time (default to current date/time)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Default location (Rotterdam, Netherlands)
  const [mapLocation, setMapLocation] = useState({
    latitude: 51.9244,
    longitude: 4.4626
  });
  
  // New state to track if a location has been placed/checked
  const [isLocationPlaced, setIsLocationPlaced] = useState(false);
  
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

  // Handler for placement state changes
  const handlePlacementStateChange = (isPlaced: boolean) => {
    setIsLocationPlaced(isPlaced);
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
            onPlacementStateChange={handlePlacementStateChange}
          />
        </div>
      </div>
      
      {/* Only show the time slider when a location is placed */}
      {isLocationPlaced && (
        <div className="footer">
          <TimeSlider 
            date={currentTime}
            latitude={mapLocation.latitude}
            longitude={mapLocation.longitude}
            onTimeChange={handleTimeChange}
          />
        </div>
      )}
    </main>
  );
}
