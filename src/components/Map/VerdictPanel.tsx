import React, { useCallback, useMemo, useState } from "react";
import SunArc from "./SunArc";
import { findNextChange, type DaySample } from "../../lib/sunUtils";
import {
  describeSky,
  weatherAt,
  clearestWindow,
  OVERCAST_THRESHOLD,
  SKY_LABEL,
  type DayWeather,
} from "../../lib/weather";
import type { PlacementState, SelectedPoint } from "./types";

interface VerdictPanelProps {
  placementState: PlacementState;
  isZoomSufficient: boolean;
  selectedPoint: SelectedPoint | null;
  currentTime: Date;
  timeline: DaySample[] | null;
  isCalculating: boolean;
  weather: DayWeather | null;
  sunrise: Date | null;
  sunset: Date | null;
  onCheck: () => void;
  onReset: () => void;
  onTimeChange: (time: Date) => void;
  onScrubEnd?: () => void;
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

const formatMinutes = (m: number) => {
  const wrapped = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const min = Math.round(wrapped % 60);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/** How long the wait is, from the scrubbed time to the change. */
const formatDelay = (m: number) => {
  const total = Math.round(m);
  if (total <= 0) return null;
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const min = total % 60;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
};

const SunIcon = () => (
  <svg className="verdict-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 1.8v2.4M12 19.8v2.4M22.2 12h-2.4M4.2 12H1.8" />
      <path d="M19.2 4.8l-1.7 1.7M6.5 17.5l-1.7 1.7M19.2 19.2l-1.7-1.7M6.5 6.5L4.8 4.8" />
    </g>
  </svg>
);

/** A sun going behind a building edge — the thing that actually causes shade. */
const ShadeIcon = () => (
  <svg className="verdict-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="9.5" cy="9" r="4" fill="currentColor" opacity="0.45" />
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.45">
      <path d="M9.5 1.6v1.9M2.6 9h1.9M4.6 4.1l1.4 1.4" />
    </g>
    <path
      d="M12 21.5V8.5l8 -2.2v15.2z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const CloudIcon = () => (
  <svg className="verdict-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="8.5" cy="8" r="3.2" fill="currentColor" opacity="0.4" />
    <path
      d="M7 19.5a4.2 4.2 0 01-.5-8.37 5.8 5.8 0 0111.2 1.2A3.6 3.6 0 0117.4 19.5z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const NightIcon = () => (
  <svg className="verdict-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 14.2A8.6 8.6 0 019.8 4a8.6 8.6 0 100 17.2 8.6 8.6 0 0010.2-7z"
      fill="currentColor"
    />
  </svg>
);

const VerdictPanel: React.FC<VerdictPanelProps> = ({
  placementState,
  isZoomSufficient,
  selectedPoint,
  currentTime,
  timeline,
  isCalculating,
  weather,
  sunrise,
  sunset,
  onCheck,
  onReset,
  onTimeChange,
  onScrubEnd,
}) => {
  const [copied, setCopied] = useState(false);

  const minutes = minutesOf(currentTime);

  // Scrub across the lit part of the day plus a margin, so the horizon
  // crossings stay visible at both ends instead of sitting on the edge.
  const [startMinutes, endMinutes] = useMemo(() => {
    if (!sunrise || !sunset || isNaN(sunrise.getTime()) || isNaN(sunset.getTime()))
      return [0, 1435];

    return [
      Math.max(0, minutesOf(sunrise) - 45),
      Math.min(1435, minutesOf(sunset) + 45),
    ];
  }, [sunrise, sunset]);

  const handleArcChange = useCallback(
    (nextMinutes: number) => {
      const next = new Date(currentTime);
      next.setHours(Math.floor(nextMinutes / 60), nextMinutes % 60, 0, 0);
      onTimeChange(next);
    },
    [currentTime, onTimeChange]
  );

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the URL bar
      // already holds the right link, so say nothing rather than alarm.
    }
  }, []);

  /* ---------------- Idle ---------------- */

  if (placementState !== "placed" || !selectedPoint) {
    return (
      <div className="panel">
        <div className="panel-idle">
          <p className="panel-prompt">
            {isZoomSufficient ? (
              <>
                <strong>Pick a spot</strong>
                Tap anywhere on the map, or line up the marker and use the
                button.
              </>
            ) : (
              <>
                <strong>Zoom in to see shade</strong>
                Shade comes from buildings, so get down to street level.
              </>
            )}
          </p>
          {isZoomSufficient && (
            <button className="btn btn-primary" onClick={onCheck}>
              Check the marker
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Result ---------------- */

  const sunIsUp =
    sunrise && sunset ? minutes >= minutesOf(sunrise) && minutes <= minutesOf(sunset) : true;
  const inSun = selectedPoint.isInSunlight;

  const now = weatherAt(weather, minutes);
  const overcast = now !== null && now.cloudCover >= OVERCAST_THRESHOLD;

  // Nothing built is in the way, but the sky is shut. Worth its own state:
  // "in the sun" would be a promise the weather won't keep.
  const verdict = !sunIsUp
    ? "night"
    : inSun
      ? overcast
        ? "cloudy"
        : "sun"
      : "shade";

  const change = timeline ? findNextChange(timeline, minutes) : null;

  let detail: React.ReactNode = null;
  if (isCalculating) {
    detail = "Working out the day…";
  } else if (verdict === "night") {
    const nextSunrise = sunrise ? formatMinutes(minutesOf(sunrise)) : null;
    detail = nextSunrise ? (
      <>
        The sun is down. It rises at <b>{nextSunrise}</b>.
      </>
    ) : (
      "The sun is down."
    );
  } else if (verdict === "cloudy") {
    // The geometry is fine, so point at when the sky is likely to open.
    const clearer = clearestWindow(
      weather,
      minutes,
      sunset ? minutesOf(sunset) : 1435
    );
    detail =
      clearer && clearer.cloudCover < OVERCAST_THRESHOLD ? (
        <>
          Nothing blocks this spot, but it&rsquo;s {SKY_LABEL[describeSky(now!.cloudCover)]}.
          Clearest around <b>{formatMinutes(clearer.minutes)}</b>.
        </>
      ) : (
        <>
          Nothing blocks this spot, but it&rsquo;s {SKY_LABEL[describeSky(now!.cloudCover)]} all day.
        </>
      );
  } else if (change) {
    const wait = formatDelay(change.minutes - minutes);
    detail = change.toSun ? (
      <>
        Sun reaches this spot at <b>{formatMinutes(change.minutes)}</b>
        {wait && (
          <>
            , in <b>{wait}</b>
          </>
        )}
        .
      </>
    ) : (
      <>
        Sunny until <b>{formatMinutes(change.minutes)}</b>.
      </>
    );
  } else if (verdict === "sun") {
    detail = <>Stays sunny until sunset.</>;
  } else {
    detail = <>Stays shaded for the rest of the day.</>;
  }

  return (
    <div className="panel" data-verdict={verdict}>
      <div className="panel-head">
        <div>
          <div className="verdict-label">
            {verdict === "sun" && <SunIcon />}
            {verdict === "shade" && <ShadeIcon />}
            {verdict === "cloudy" && <CloudIcon />}
            {verdict === "night" && <NightIcon />}
            {verdict === "sun" && "In the sun"}
            {verdict === "shade" && "In the shade"}
            {verdict === "cloudy" && "Under cloud"}
            {verdict === "night" && "After dark"}
          </div>
          <div className="verdict-detail">{detail}</div>
        </div>
        <div className="clock">
          {formatMinutes(minutes)}
          <span className="clock-day">
            {now && !isNaN(now.temperature) ? (
              <>
                {Math.round(now.temperature)}&deg;C &middot;{" "}
                {Math.round(now.cloudCover)}% cloud
              </>
            ) : (
              currentTime.toLocaleDateString([], {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            )}
          </span>
        </div>
      </div>

      {timeline && (
        <>
          <SunArc
            timeline={timeline}
            minutes={minutes}
            startMinutes={startMinutes}
            endMinutes={endMinutes}
            onChange={handleArcChange}
            onScrubEnd={onScrubEnd}
            formatTime={formatMinutes}
          />
          {weather && (
            <div
              className="cloudbar"
              title="Cloud cover across the day"
              aria-label="Cloud cover across the day"
            >
              {Array.from({ length: 48 }, (_, i) => {
                const at = startMinutes + ((endMinutes - startMinutes) * i) / 47;
                const cover = weatherAt(weather, at)?.cloudCover ?? 0;
                return (
                  <span
                    key={i}
                    style={{ opacity: 0.08 + (cover / 100) * 0.92 }}
                  />
                );
              })}
            </div>
          )}

          <div className="sunarc-scale">
            <span>
              Sunrise <b>{sunrise ? formatMinutes(minutesOf(sunrise)) : "--:--"}</b>
            </span>
            <span>
              Sunset <b>{sunset ? formatMinutes(minutesOf(sunset)) : "--:--"}</b>
            </span>
          </div>
        </>
      )}

      <div className="panel-actions">
        <button className="btn btn-ghost" onClick={onReset}>
          Pick another spot
        </button>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={handleShare}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
};

export default VerdictPanel;
