import React from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import { SearchBoxRetrieveResponse } from '@mapbox/search-js-core';
import '@mapbox/search-js-web';
import mapboxgl from 'mapbox-gl';

interface SearchBoxWrapperProps {
  map: mapboxgl.Map;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
}

const SearchBoxWrapper: React.FC<SearchBoxWrapperProps> = ({ 
  map, 
  onLocationSelect,
  className
}) => {
  const handleSearchResult = (result: SearchBoxRetrieveResponse) => {
    if (!map || !result || !result.features || result.features.length === 0) return;
    
    // Get the coordinates from the first feature
    const [lng, lat] = result.features[0].geometry.coordinates;
    
    // Fly to the location (but don't place a marker yet)
    map.flyTo({
      center: [lng, lat],
      zoom: 8,
      duration: 2000
    });

    // If we have a location select handler, call it
    if (onLocationSelect) {
      onLocationSelect(lat, lng);
    }
  };

  return (
    <div className={className || 'search-box-wrapper'}>
      {/* @ts-expect-error - SearchBox component has incorrect type definitions for its props */}
      <SearchBox
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""}
        onRetrieve={handleSearchResult}
        placeholder="Search a place or address"
        value=""
        map={map}
        marker={false}
        mapboxgl={mapboxgl}
        theme={{
          variables: {
            unit: '14px',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            colorBackground: 'rgba(255,255,255,0.95)',
            colorText: '#111827',
            colorPrimary: '#0ea5e9',
            colorSecondary: '#111827',
            padding: '8px',
          },
        }}
      />
    </div>
  );
};

export default SearchBoxWrapper; 