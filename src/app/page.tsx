'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import TimeSlider from '../components/TimeSlider';
import InfoPanel from '../components/InfoPanel';
import { getSunPosition, SunPosition } from '../lib/sunUtils';

// Import the map component dynamically to avoid SSR issues
const DynamicMap = dynamic(
  () => import('../components/DynamicMap'),
  { ssr: false }
);

export default function Home() {
  // State for current time (default to current date/time)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // State for selected location (lat/lng and sunlight status)
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
    isInSunlight: boolean;
  } | null>(null);
  
  // Default location (Rotterdam, Netherlands)
  const [mapLocation, setMapLocation] = useState({
    latitude: 51.9244,
    longitude: 4.4626
  });
  
  // State for sun position
  const [sunPosition, setSunPosition] = useState<SunPosition | null>(null);
  
  // Update sun position when time or location changes
  useEffect(() => {
    if (!mapLocation) return;
    
    const newSunPosition = getSunPosition(
      currentTime, 
      mapLocation.latitude, 
      mapLocation.longitude
    );
    
    setSunPosition(newSunPosition);
  }, [currentTime, mapLocation]);
  
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
    
    // Calculate if the point is in sunlight based on current time
    const pointSunPosition = getSunPosition(currentTime, lat, lng);
    const isInSunlight = pointSunPosition.altitude > 0; // Simple check
    
    setSelectedLocation({
      latitude: lat,
      longitude: lng,
      isInSunlight
    });
    
    console.log('Location selected:', lat, lng);
  };

  return (
    <main className="app-container">
      <header className="app-header">
        <h1>Sunlight Simulator</h1>
      </header>
      
      <div className="app-content">
        <div className="map-section">
          <DynamicMap 
            currentTime={currentTime} 
            onLocationSelect={handleLocationSelect}
            lat={mapLocation.latitude}
            lng={mapLocation.longitude}
            zoom={16}
            time={currentTime}
          />
        </div>
        
        <div className="sidebar">
          <InfoPanel 
            sunPosition={sunPosition}
            selectedLocation={selectedLocation}
            currentTime={currentTime}
          />
        </div>
      </div>
      
      <div className="footer">
        <TimeSlider 
          date={currentTime}
          latitude={mapLocation.latitude}
          longitude={mapLocation.longitude}
          onTimeChange={handleTimeChange}
        />
      </div>
    </main>
  );
}
