import React from "react";
import mapboxgl from "mapbox-gl";
import SearchBoxWrapper from "./SearchBoxWrapper";

interface TopBarProps {
  map: mapboxgl.Map;
  onLocationSelect: (lat: number, lng: number) => void;
}

/**
 * A sun with a shadow's edge cut across it — the app's whole answer, lit or
 * shaded, in one disc. The rays only exist on the side still in sun.
 *
 * Inherits `currentColor` for the lit half so it tracks the theme's sun, and
 * names the shade token directly for the other.
 */
const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden>
    <defs>
      <clipPath id="brand-disc">
        <circle cx="16" cy="16" r="8" />
      </clipPath>
    </defs>
    <g transform="translate(-2.95 3.54)">
      <path
        d="M9.92 7.32L7.86 4.37M16.69 5.42L16.93 1.83M23.16 8.18L25.59 5.53M26.48 14.39L30.03 13.84M25.18 21.30L28.30 23.10"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="8" fill="currentColor" />
      <g clipPath="url(#brand-disc)">
        <rect
          x="-24"
          y="17"
          width="80"
          height="44"
          fill="var(--shade)"
          transform="rotate(42 16 16)"
        />
      </g>
    </g>
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
