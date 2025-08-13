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
        placeholder="Zoek je favoriete terrasje..."
        value=""
        map={map}
        marker={false} // Don't show the search marker
        mapboxgl={mapboxgl}
      />
    </div>
  );
};

export default SearchBoxWrapper; 