import React, { useCallback } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import { SearchBoxRetrieveResponse } from '@mapbox/search-js-core';
import '@mapbox/search-js-web';
import mapboxgl from 'mapbox-gl';

interface SearchBoxWrapperProps {
  map: mapboxgl.Map;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
}

/**
 * Shade is cast by buildings, so a search has to land close enough to see
 * them. Anything further out drops below the zoom at which the app can
 * answer anything, leaving the user staring at a map with no controls.
 *
 * The camera is driven here rather than by passing `map` to SearchBox:
 * that makes the component fit the result's bounding box, which for a
 * street means framing the whole neighbourhood.
 */
const SEARCH_LANDING_ZOOM = 18;

const SearchBoxWrapper: React.FC<SearchBoxWrapperProps> = ({
  map,
  onLocationSelect,
  className,
}) => {
  const handleSearchResult = useCallback(
    (result: SearchBoxRetrieveResponse) => {
      if (!map || !result?.features?.length) return;

      const [lng, lat] = result.features[0].geometry.coordinates;

      map.flyTo({
        center: [lng, lat],
        zoom: SEARCH_LANDING_ZOOM,
        pitch: 55,
        duration: 2200,
        essential: true,
      });

      onLocationSelect?.(lat, lng);
    },
    [map, onLocationSelect]
  );

  return (
    <div className={className || 'search-box-wrapper'}>
      <SearchBox
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
        onRetrieve={handleSearchResult}
        placeholder="Search a street, café or park"
        value=""
        marker={false}
        mapboxgl={mapboxgl}
        theme={{
          variables: {
            unit: '14px',
            borderRadius: '12px',
            boxShadow:
              '0 1px 2px rgba(15,24,38,0.08), 0 4px 16px -4px rgba(15,24,38,0.16)',
            colorBackground: 'var(--panel-solid)',
            colorText: 'var(--ink)',
            colorSecondary: 'var(--ink-mid)',
            colorPrimary: 'var(--sun)',
            border: '1px solid var(--hairline)',
            padding: '0.55em 0.9em',
            fontFamily: 'var(--font-ui), sans-serif',
          },
        }}
      />
    </div>
  );
};

export default SearchBoxWrapper;
