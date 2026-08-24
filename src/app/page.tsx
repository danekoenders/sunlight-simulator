'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DynamicMap from '../components/DynamicMap';

// Where the map opens when there's nothing else to go on.
const FALLBACK = { latitude: 51.9244, longitude: 4.4626, zoom: 17.5 };

interface OpeningView {
  latitude: number;
  longitude: number;
  zoom: number;
  time: Date;
  /** True when the link named a spot, so it's worth measuring on arrival. */
  autoCheck: boolean;
}

/**
 * Reads the opening view from the URL so a link carries a whole answer:
 * this spot, at this time. Falls back to "here, now".
 */
function readOpeningView(): OpeningView {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  const zoom = parseFloat(params.get('z') ?? '');
  const minutes = parseInt(params.get('t') ?? '', 10);

  const hasSpot = Number.isFinite(lat) && Number.isFinite(lng);

  const time = new Date();
  if (Number.isFinite(minutes) && minutes >= 0 && minutes < 1440) {
    time.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  }

  return {
    latitude: hasSpot ? lat : FALLBACK.latitude,
    longitude: hasSpot ? lng : FALLBACK.longitude,
    zoom: Number.isFinite(zoom) ? zoom : FALLBACK.zoom,
    time,
    autoCheck: hasSpot,
  };
}

export default function AppPage() {
  // Resolved on the client only: the opening view depends on the URL and on
  // the current time, neither of which the server can know.
  const [view, setView] = useState<OpeningView | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const spotRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const opening = readOpeningView();
    setView(opening);
    setCurrentTime(opening.time);
  }, []);

  /** Keeps the address bar in step, so "copy link" always shares what's on screen. */
  const syncUrl = useCallback(() => {
    if (!spotRef.current || !currentTime) return;

    const params = new URLSearchParams({
      lat: spotRef.current.lat.toFixed(6),
      lng: spotRef.current.lng.toFixed(6),
      t: String(currentTime.getHours() * 60 + currentTime.getMinutes()),
    });

    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [currentTime]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  const handleTimeChange = useCallback((newTime: Date) => {
    setCurrentTime(newTime);
  }, []);

  const handleSpotChange = useCallback(
    (spot: { lat: number; lng: number } | null) => {
      spotRef.current = spot;
      if (spot) {
        syncUrl();
      } else {
        window.history.replaceState(null, '', window.location.pathname);
      }
    },
    [syncUrl]
  );

  if (!view || !currentTime) {
    return <main className="app" />;
  }

  return (
    <main className="app">
      <DynamicMap
        currentTime={currentTime}
        lat={view.latitude}
        lng={view.longitude}
        zoom={view.zoom}
        autoCheck={view.autoCheck}
        onTimeChange={handleTimeChange}
        onSpotChange={handleSpotChange}
      />
    </main>
  );
}
