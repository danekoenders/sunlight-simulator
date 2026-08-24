/**
 * Cloud cover, from Open-Meteo.
 *
 * Geometry alone can't answer "is it sunny here" — a spot can have a clear
 * line to the sun and still be under a grey lid. The ray tracer says whether
 * anything *built* is in the way; this says whether the sky is.
 *
 * Open-Meteo needs no API key and allows browser requests, so the app stays
 * usable by anyone who clones it.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export interface HourWeather {
  /** Minutes since local midnight. */
  minutes: number;
  /** Percentage, 0–100. */
  cloudCover: number;
  temperature: number;
  precipitationChance: number;
}

export interface DayWeather {
  hours: HourWeather[];
  /** Whether the forecast actually covers the requested day. */
  isForecast: boolean;
}

export type SkyCondition = "clear" | "partly" | "cloudy" | "overcast";

/**
 * Bands chosen so the labels match what someone standing outside would say,
 * rather than splitting the range evenly.
 */
export function describeSky(cloudCover: number): SkyCondition {
  if (cloudCover < 25) return "clear";
  if (cloudCover < 60) return "partly";
  if (cloudCover < 85) return "cloudy";
  return "overcast";
}

export const SKY_LABEL: Record<SkyCondition, string> = {
  clear: "clear",
  partly: "partly cloudy",
  cloudy: "mostly cloudy",
  overcast: "overcast",
};

/**
 * Above this, direct sun is diffuse enough that calling a spot "in the sun"
 * would be misleading even when nothing is blocking it.
 */
export const OVERCAST_THRESHOLD = 60;

const pad = (n: number) => String(n).padStart(2, "0");
const toDateParam = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Fetches hourly cloud cover for one local day.
 *
 * The timezone is pinned to the browser's rather than the coordinates', so the
 * hours line up with the clock the rest of the app runs on.
 */
export async function fetchDayWeather(
  latitude: number,
  longitude: number,
  date: Date,
  signal?: AbortSignal
): Promise<DayWeather | null> {
  const day = toDateParam(date);
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "auto";

  const url =
    `${ENDPOINT}?latitude=${latitude.toFixed(4)}` +
    `&longitude=${longitude.toFixed(4)}` +
    `&hourly=cloud_cover,temperature_2m,precipitation_probability` +
    `&timezone=${encodeURIComponent(timezone)}` +
    `&start_date=${day}&end_date=${day}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const data = await response.json();
    const times: string[] = data?.hourly?.time ?? [];
    const cloud: number[] = data?.hourly?.cloud_cover ?? [];
    const temp: number[] = data?.hourly?.temperature_2m ?? [];
    const rain: number[] = data?.hourly?.precipitation_probability ?? [];

    if (!times.length) return null;

    const hours: HourWeather[] = times.map((iso, i) => {
      // "2026-08-24T14:00" — already local, so read the hour off the string
      // rather than letting Date reinterpret it.
      const hour = parseInt(iso.slice(11, 13), 10);
      return {
        minutes: hour * 60,
        cloudCover: cloud[i] ?? 0,
        temperature: temp[i] ?? NaN,
        precipitationChance: rain[i] ?? 0,
      };
    });

    return { hours, isForecast: true };
  } catch {
    // Offline, blocked, or aborted. The app still answers the geometric
    // question, which is the part it owns.
    return null;
  }
}

/** Linear interpolation between the surrounding hourly readings. */
export function weatherAt(
  weather: DayWeather | null,
  minutes: number
): HourWeather | null {
  if (!weather?.hours.length) return null;

  const hours = weather.hours;
  if (minutes <= hours[0].minutes) return hours[0];
  if (minutes >= hours[hours.length - 1].minutes) return hours[hours.length - 1];

  const nextIndex = hours.findIndex((h) => h.minutes >= minutes);
  const after = hours[nextIndex];
  const before = hours[nextIndex - 1] ?? after;
  if (after.minutes === before.minutes) return after;

  const t = (minutes - before.minutes) / (after.minutes - before.minutes);
  const mix = (a: number, b: number) => a + (b - a) * t;

  return {
    minutes,
    cloudCover: mix(before.cloudCover, after.cloudCover),
    temperature: mix(before.temperature, after.temperature),
    precipitationChance: mix(
      before.precipitationChance,
      after.precipitationChance
    ),
  };
}

/**
 * The sunniest stretch of a day, judged on cloud cover alone. Used to suggest
 * a better time when the spot is under cloud right now.
 */
export function clearestWindow(
  weather: DayWeather | null,
  fromMinutes: number,
  toMinutes: number
): { minutes: number; cloudCover: number } | null {
  if (!weather?.hours.length) return null;

  const within = weather.hours.filter(
    (h) => h.minutes >= fromMinutes && h.minutes <= toMinutes
  );
  if (!within.length) return null;

  return within.reduce((best, h) =>
    h.cloudCover < best.cloudCover ? h : best
  );
}
