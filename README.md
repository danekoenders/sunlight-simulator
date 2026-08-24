# Solmate

Find your spot in the sun.

Pick any point on a 3D city map and Solmate answers one question: is it sunny
there, and until when? It ray-traces the sun against real building heights, so
the answer accounts for the block across the street — not just whether the sun
happens to be above the horizon.

- **A straight answer.** "In the sun · sunny until 15:10", not a coloured dot.
- **Cloud counts too.** A clear line to the sun is not sun if the sky is shut,
  so a spot nothing blocks but cloud reads "Under cloud", with the clearest
  hour of the day to aim for instead.
- **The whole day at a glance.** The scrubber draws the sun's real altitude
  curve for that place and date, tinted by whether *your* spot is lit. You can
  read "sunny from 10:30 to 14:00" off the shape without touching anything.
- **Shareable.** Every spot and time lives in the URL, and opening a link
  measures the spot on arrival.
- **Built for a phone.** Tap the map to check a spot; the centre marker stays
  for when a fingertip is too blunt.

## Getting started

Requires Node.js, [pnpm](https://pnpm.io), and a
[Mapbox access token](https://docs.mapbox.com/help/getting-started/access-tokens/).

```bash
pnpm install
echo 'NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here' > .env.local
pnpm dev
```

Then open http://localhost:3000.

The map style is a private Mapbox Studio style
(`mapbox://styles/danekoenders/…`, set in `src/components/Map.tsx`). To run this
against your own account, swap that constant for a style of your own — it needs
a `building-extrusion` layer carrying a numeric `height` property, which is what
the shadow tracing reads.

## How it works

Two independent questions, kept apart on purpose. The arc answers *does
anything block this spot* (geometry). The cloud strip beneath it answers *is
the sky open* (weather). Reading them together is the real answer, and keeping
them in separate lanes keeps each one legible.

Geometry wins ties: a building in the way is a harder fact than cloud, so a
shaded spot reads "In the shade" whatever the sky is doing.

`src/lib/weather.ts` pulls hourly cloud cover from
[Open-Meteo](https://open-meteo.com/), which needs no API key and allows
browser requests. If the call fails the app carries on — the geometric answer
is the part it owns. Hours are requested in the browser's timezone so they line
up with the clock the rest of the app runs on.

`src/lib/sunUtils.ts` holds the sun maths and the tracing:

1. `collectShadowCasters` queries the rendered building layer once around the
   point and precomputes each building's angular height above the horizon.
   Buildings containing the point are excluded — otherwise the ray leaves
   through its own walls and the spot reads as shaded all day.
2. `isShadowedByCasters` walks a ray toward the sun. Buildings too low to reach
   the sun's current altitude are rejected with a scalar comparison before any
   geometry work.
3. `computeDayTimeline` runs that across the whole day, so the arc and every
   scrubber position are lookups rather than fresh traces.

## Known limits

- Building footprints come from OpenStreetMap via Mapbox and are only as
  complete as the local data. Missing buildings read as sun.
- Trees, awnings, and terrain are not modelled — only building extrusions.
- Transitions are resolved to the timeline's sampling step (10 minutes).
- The point is treated as being at ground level.
- Cloud cover is a whole-sky hourly figure, so it cannot tell you the sun
  specifically is behind a cloud at a given minute.
- Weather covers the current day only; there is no date picker yet.

## Built with

[Next.js](https://nextjs.org/) · [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/api/)
· [SunCalc](https://github.com/mourner/suncalc) · [Turf.js](https://turfjs.org/)

## License

MIT — see [LICENSE](LICENSE).
