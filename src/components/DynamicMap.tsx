import React from 'react';
import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// Define the proper props type
interface MapProps {
  currentTime: Date;
  onLocationSelect?: (lat: number, lng: number) => void;
  onMapLoad?: () => void;
  lat?: number;
  lng?: number;
  zoom?: number;
  time?: Date;
  onPlacementStateChange?: (isPlaced: boolean) => void;
  onTimeChange?: (newTime: Date) => void;
}

// Dynamically import the Map component with SSR disabled
const DynamicMap = dynamic(
  () => import('./Map'),
  { 
    ssr: false,
    loading: () => <div className="map-loading">Loading Map...</div>
  }
) as ComponentType<MapProps>;

export default DynamicMap; 