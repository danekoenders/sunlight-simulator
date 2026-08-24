import dynamic from 'next/dynamic';
import { ComponentType } from 'react';
import type { MapProps } from './Map/types';

// Mapbox GL touches window on import, so it can only run in the browser.
const DynamicMap = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => <div className="map-loading">Loading the map…</div>,
}) as ComponentType<MapProps>;

export default DynamicMap;
