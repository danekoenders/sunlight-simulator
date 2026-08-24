import React from "react";
import mapboxgl from "mapbox-gl";
import SearchBoxWrapper from "./SearchBoxWrapper";

interface TopBarProps {
  map: mapboxgl.Map;
  onLocationSelect: (lat: number, lng: number) => void;
}

/** A gnomon: the sun, and the shadow it throws. The whole app in one mark. */
const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="8" r="3.6" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 1.4v1.8M18.6 8h1.8M3.6 8h1.8M16.7 3.3l-1.3 1.3M8.6 4.6L7.3 3.3" />
    </g>
    <path
      d="M11 21.5V13h2v8.5z"
      fill="currentColor"
      opacity="0.85"
    />
    <path
      d="M13 21.5l7.5-2.6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      opacity="0.35"
    />
  </svg>
);

const TopBar: React.FC<TopBarProps> = ({ map, onLocationSelect }) => (
  <div className="topbar">
    <div className="brand">
      <BrandMark />
      <span className="brand-label">Solmate</span>
    </div>
    <div className="search-slot">
      <SearchBoxWrapper map={map} onLocationSelect={onLocationSelect} />
    </div>
  </div>
);

export default TopBar;
