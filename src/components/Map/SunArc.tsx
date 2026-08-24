import React, { useCallback, useMemo, useRef } from "react";
import type { DaySample } from "../../lib/sunUtils";

interface SunArcProps {
  /** Whole-day samples, 00:00 → 24:00. */
  timeline: DaySample[];
  /** Currently scrubbed time, in minutes since local midnight. */
  minutes: number;
  /** Scrub bounds, in minutes since local midnight. */
  startMinutes: number;
  endMinutes: number;
  onChange: (minutes: number) => void;
  /** Fired when the scrub gesture finishes, not on every step of it. */
  onScrubEnd?: () => void;
  formatTime: (minutes: number) => string;
}

// The drawing grid. The curve lives above the horizon line; night falls below.
// Roughly 5:1, matching the panel's proportions, so the SVG can scale
// uniformly — a squashed viewBox would turn the thumb into an ellipse.
const VIEW_W = 260;
const VIEW_H = 50;
const HORIZON_Y = 40;
const TOP_Y = 7;
const STEP = 5;

/**
 * The day as the sun actually travels it.
 *
 * Height is solar altitude, so the curve's shape carries real information:
 * a tall dome in June, a shallow hump in December, barely a bump inside the
 * arctic circle in winter. The stroke is tinted per sample by whether the
 * selected spot is lit at that moment, so the arc doubles as the answer to
 * "when is this spot sunny?" — readable at a glance, before any scrubbing.
 */
const SunArc: React.FC<SunArcProps> = ({
  timeline,
  minutes,
  startMinutes,
  endMinutes,
  onChange,
  onScrubEnd,
  formatTime,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const span = Math.max(1, endMinutes - startMinutes);

  // Peak altitude sets the vertical scale, so the arc always fills the box
  // regardless of season or latitude.
  const peakAltitude = useMemo(() => {
    const peak = timeline.reduce(
      (max, s) => Math.max(max, s.altitudeDegrees),
      0
    );
    // Guard against a flat curve on polar-night days.
    return Math.max(peak, 1);
  }, [timeline]);

  const toX = useCallback(
    (m: number) => ((m - startMinutes) / span) * VIEW_W,
    [startMinutes, span]
  );

  const toY = useCallback(
    (altitude: number) => {
      const y =
        HORIZON_Y - (altitude / peakAltitude) * (HORIZON_Y - TOP_Y);
      return Math.max(TOP_Y - 2, Math.min(VIEW_H, y));
    },
    [peakAltitude]
  );

  // Samples inside the visible window, plus one either side so the curve
  // runs to the edges instead of stopping short.
  const visible = useMemo(
    () =>
      timeline.filter(
        (s) => s.minutes >= startMinutes - STEP && s.minutes <= endMinutes + STEP
      ),
    [timeline, startMinutes, endMinutes]
  );

  /**
   * Splits the curve into contiguous lit / shaded runs so each can be
   * stroked in its own colour. Runs overlap by one point to avoid visible
   * gaps at the joins.
   */
  const segments = useMemo(() => {
    const runs: { inSun: boolean; d: string }[] = [];
    let current: { inSun: boolean; points: string[] } | null = null;

    for (const sample of visible) {
      const point = `${toX(sample.minutes).toFixed(2)},${toY(
        sample.altitudeDegrees
      ).toFixed(2)}`;

      if (!current || current.inSun !== sample.inSun) {
        if (current) {
          current.points.push(point);
          runs.push({
            inSun: current.inSun,
            d: `M ${current.points.join(" L ")}`,
          });
        }
        current = { inSun: sample.inSun, points: [point] };
      } else {
        current.points.push(point);
      }
    }

    if (current && current.points.length > 1) {
      runs.push({ inSun: current.inSun, d: `M ${current.points.join(" L ")}` });
    }

    return runs;
  }, [visible, toX, toY]);

  // Interpolate the thumb between samples so it glides rather than steps.
  const thumb = useMemo(() => {
    const before = [...timeline]
      .reverse()
      .find((s) => s.minutes <= minutes);
    const after = timeline.find((s) => s.minutes >= minutes);

    if (!before) return { x: toX(minutes), y: HORIZON_Y };
    if (!after || after.minutes === before.minutes) {
      return { x: toX(minutes), y: toY(before.altitudeDegrees) };
    }

    const t = (minutes - before.minutes) / (after.minutes - before.minutes);
    const altitude =
      before.altitudeDegrees +
      (after.altitudeDegrees - before.altitudeDegrees) * t;

    return { x: toX(minutes), y: toY(altitude) };
  }, [timeline, minutes, toX, toY]);

  const commit = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      const raw = startMinutes + fraction * span;
      onChange(Math.round(raw / STEP) * STEP);
    },
    [onChange, startMinutes, span]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // A drag that leaves the track would otherwise select the panel's text
      // behind it. Suppressing that also suppresses focus, so take focus by
      // hand — the arrow keys scrub too.
      e.preventDefault();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      commit(e.clientX);
    },
    [commit]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      commit(e.clientX);
    },
    [commit]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      onScrubEnd?.();
    },
    [onScrubEnd]
  );

  const isScrubKey = (key: string) =>
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End";

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isScrubKey(e.key)) onScrubEnd?.();
    },
    [onScrubEnd]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const jump =
        e.key === "PageUp" || e.key === "PageDown" ? 60 : e.shiftKey ? 30 : STEP;
      let next: number | null = null;

      if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown")
        next = minutes - jump;
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp")
        next = minutes + jump;
      if (e.key === "Home") next = startMinutes;
      if (e.key === "End") next = endMinutes;

      if (next === null) return;
      e.preventDefault();
      onChange(Math.max(startMinutes, Math.min(endMinutes, next)));
    },
    [minutes, onChange, startMinutes, endMinutes]
  );

  return (
    <div
      className="sunarc"
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Time of day"
      aria-valuemin={startMinutes}
      aria-valuemax={endMinutes}
      aria-valuenow={minutes}
      aria-valuetext={formatTime(minutes)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        {/* Below the horizon: the sun is down whatever the buildings do. */}
        <rect
          className="sunarc-night"
          x="0"
          y={HORIZON_Y}
          width={VIEW_W}
          height={VIEW_H - HORIZON_Y}
        />
        <line
          className="sunarc-horizon"
          x1="0"
          y1={HORIZON_Y}
          x2={VIEW_W}
          y2={HORIZON_Y}
        />

        {segments.map((seg, i) => (
          <path
            key={i}
            className={`sunarc-seg ${seg.inSun ? "is-sun" : "is-shade"}`}
            d={seg.d}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Drop a stem to the horizon so the thumb's time is readable
            against the scale below. */}
        <line
          className="sunarc-stem"
          x1={thumb.x}
          y1={thumb.y}
          x2={thumb.x}
          y2={HORIZON_Y}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          className="sunarc-thumb-halo"
          cx={thumb.x}
          cy={thumb.y}
          r="7"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          className="sunarc-thumb"
          cx={thumb.x}
          cy={thumb.y}
          r="4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

export default SunArc;
