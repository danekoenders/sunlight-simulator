import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// Dynamically import the Map component with SSR disabled
const DynamicMap = dynamic(
  () => import('./Map'),
  { 
    ssr: false,
    loading: () => <div className="map-loading">Loading Map...</div>
  }
) as ComponentType<any>;

export default DynamicMap; 