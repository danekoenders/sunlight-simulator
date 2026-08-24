# Solmate

Find your spot in the sun.

Pick any point on a 3D city map and Solmate answers one question: is it sunny
there, and until when? It ray-traces the sun against real building heights, so
the answer accounts for the block across the street — not just whether the sun
happens to be above the horizon.

- **A straight answer.** "In the sun · sunny until 15:10", not a coloured dot.
- **The whole day at a glance.** The scrubber draws the sun's real altitude
  curve for that place and date, tinted by whether *your* spot is lit. You can
  read "sunny from 10:30 to 14:00" off the shape without touching anything.
- **Shareable.** Every spot and time lives in the URL, and opening a link
  measures the spot on arrival.

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

## Built with

[Next.js](https://nextjs.org/) · [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/api/)
· [SunCalc](https://github.com/mourner/suncalc) · [Turf.js](https://turfjs.org/)

## License

MIT — see [LICENSE](LICENSE).
