# Sunlight Simulator

A web-based application for visualizing sunlight and shadows on a 3D map based on location, date, and time. This tool allows you to:

- View buildings in 3D on a map
- Adjust time to see how sunlight changes throughout the day
- Click on any location to determine if it's in sunlight or shadow
- See sunrise and sunset times for the selected location

## Features

- Interactive 3D map using Mapbox GL JS
- Time slider to adjust the time of day
- Sun position calculation with SunCalc.js
- Responsive design for desktop and mobile
- Real-time sunlight/shadow determination

## Tech Stack

- Next.js (React)
- TypeScript
- Mapbox GL JS for 3D maps and building data
- SunCalc.js for sun position calculations
- CSS for styling

## Getting Started

### Prerequisites

You need to have Node.js and npm installed on your machine. You also need a Mapbox account and API key.

### Setup

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the project root and add your Mapbox token:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## How to Use

1. The map initially centers on San Francisco. You can navigate using the map controls.
2. Use the time slider at the bottom to change the time of day.
3. Click on any location on the map to see if it's in direct sunlight or shadow.
4. The sidebar displays detailed information about the sun position and selected location.
5. Sunrise and sunset times are marked on the time slider.

## Limitations

- The shadow calculation is simplified and only considers whether the sun is above the horizon.
- For accurate shadow casting from buildings, a more complex algorithm would be needed.
- The application relies on OpenStreetMap building data, which may not be complete in all areas.

## Future Enhancements

- Implement true shadow casting from 3D buildings
- Add a date picker to simulate different days of the year
- Include terrain data for more accurate shadow calculations
- Add ability to save and share locations

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgements

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/api/) for the 3D mapping capabilities
- [SunCalc](https://github.com/mourner/suncalc) for sun position calculations
- [Next.js](https://nextjs.org/) for the React framework
