import * as SunCalc from 'suncalc';
import * as turf from '@turf/turf';
import { Polygon } from 'geojson';
import mapboxgl from 'mapbox-gl';

export interface SunPosition {
  altitude: number; // Radians
  azimuth: number; // Radians
  altitudeDegrees: number; // Degrees
  azimuthDegrees: number; // Degrees
}

export interface LightSettings {
  position: [number, number, number]; // [radial, azimuthal, polar]
  anchor: 'viewport' | 'map';
  color?: string;
  intensity?: number;
}

export interface Building {
  id: string;
  height: number; // meters
  geometry: Polygon;
}

// Define types for the new Mapbox lighting system
export interface AmbientLight {
  color: string;
  intensity: number;
}

export interface DirectionalLight {
  color: string;
  intensity: number;
  direction: [number, number]; // [azimuthal, polar] in degrees
  castShadows?: boolean;
}

/**
 * Gets the sun position for a given date and location
 */
export function getSunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const sunPos = SunCalc.getPosition(date, latitude, longitude);
  
  // Convert radians to degrees for easier handling
  const altitudeDegrees = sunPos.altitude * (180 / Math.PI);
  const azimuthDegrees = sunPos.azimuth * (180 / Math.PI);
  
  return {
    altitude: sunPos.altitude,
    azimuth: sunPos.azimuth,
    altitudeDegrees,
    azimuthDegrees
  };
}

/**
 * Converts SunCalc position to Mapbox light settings for the new setLights API
 */
export function sunPositionToMapboxLight(sunPosition: SunPosition): {
  ambient: AmbientLight;
  directional: DirectionalLight;
} {
  // Convert SunCalc's azimuth (south = 0, west = -PI/2, east = PI/2) 
  // to Mapbox's azimuthal angle (north = 0, east = 90, south = 180, west = 270)
  const azimuthalAngle = (sunPosition.azimuthDegrees + 180) % 360;
  
  // Convert altitude to polar angle (90° - altitude)
  // Clamp the polar angle to be between 0° and 90° as required by Mapbox
  const polarAngle = Math.min(90, Math.max(0, 90 - sunPosition.altitudeDegrees));
  
  // Set light color and intensity based on sun altitude
  let ambientColor = '#ffffff';  // Default white
  let ambientIntensity = 0.25;   // Default ambient intensity
  
  let directionalColor = '#ffffff'; // Default white
  let directionalIntensity = 0.9;  // Default directional intensity
  
  if (sunPosition.altitudeDegrees < 0) {
    // Night time (sun below horizon)
    ambientColor = '#103163';        // Deep blue for ambient
    ambientIntensity = 0.1;          // Dim ambient light
    
    directionalColor = '#000000';    // No directional light at night
    directionalIntensity = 0;        // Zero intensity for directional light
  } else if (sunPosition.altitudeDegrees < 10) {
    // Dawn/dusk
    ambientColor = '#493838';        // Dim brownish ambient
    ambientIntensity = 0.15;         // Low ambient
    
    directionalColor = '#ff9e57';    // Orange-ish directional light
    directionalIntensity = 0.5;      // Medium directional intensity
  } else if (sunPosition.altitudeDegrees < 30) {
    // Morning/evening
    ambientColor = '#d6d6d6';        // Light gray ambient
    ambientIntensity = 0.2;          // Medium-low ambient
    
    directionalColor = '#ffefcc';    // Warm directional light
    directionalIntensity = 0.7;      // Medium-high directional
  } else {
    // Midday
    ambientColor = '#f2f2f2';        // Light ambient
    ambientIntensity = 0.25;         // Standard ambient
    
    directionalColor = '#ffffff';    // White direct sunlight
    directionalIntensity = 0.9;      // Bright directional light
  }
  
  // Create the ambient light object
  const ambient: AmbientLight = {
    color: ambientColor,
    intensity: ambientIntensity
  };
  
  // Create the directional light object
  const directional: DirectionalLight = {
    color: directionalColor,
    intensity: directionalIntensity,
    direction: [azimuthalAngle, polarAngle], // [azimuthal, polar] in degrees
    castShadows: true                        // Enable shadow casting
  };
  
  return {
    ambient,
    directional
  };
}

/**
 * Simple check if point is in sunlight based on sun altitude
 * Note: This doesn't account for buildings or terrain shadows
 */
export function isPointInSunlight(sunPosition: SunPosition): boolean {
  // If sun is below horizon, point is in shadow
  return sunPosition.altitude > 0;
}

/**
 * Gets nearby buildings from the map that could cast shadows
 */
export function getNearbyBuildings(
  map: mapboxgl.Map,
  center: [number, number],
  radiusInMeters: number = 300
): Array<GeoJSON.Feature> {
  try {
    // Get the current zoom level of the map
    const zoom = map.getZoom();
    console.log(`Getting buildings within ${radiusInMeters}m radius at zoom level ${zoom}`);
    
    // Convert center to pixel coordinates
    const centerPixel = map.project(center);
    
    // Approximate pixels per meter at this location and zoom level
    // This is a rough approximation that varies by latitude and zoom
    const metersPerPixelApprox = 156543.03392 * Math.cos(center[1] * Math.PI / 180) / Math.pow(2, zoom);
    const radiusInPixels = radiusInMeters / metersPerPixelApprox;
    
    console.log(`Meters per pixel: ~${metersPerPixelApprox.toFixed(2)}, radius in pixels: ~${radiusInPixels.toFixed(2)}`);
    
    // Define bounding box in pixel coordinates as [[x1, y1], [x2, y2]] format required by mapbox
    const bbox: [[number, number], [number, number]] = [
      [centerPixel.x - radiusInPixels, centerPixel.y - radiusInPixels],
      [centerPixel.x + radiusInPixels, centerPixel.y + radiusInPixels]
    ];
    
    // Use the building-extrusion layer directly
    const buildingLayerId = 'building-extrusion';
    console.log(`Using building layer: ${buildingLayerId} for nearby buildings query`);
    
    // Query building features in pixel coordinates
    const features = map.queryRenderedFeatures(bbox, {
      layers: [buildingLayerId]
    });
    
    console.log(`Found ${features.length} building features in pixel bounding box`);
    return features;
  } catch (error) {
    console.error("Error getting nearby buildings:", error);
    return [];
  }
}

/**
 * Checks if a point is in a building's shadow based on sun position
 */
export function isPointInBuildingShadow(
  map: mapboxgl.Map,
  point: [number, number],
  sunPosition: SunPosition
): boolean {
  try {
    // If sun is below horizon, everything is in shadow
    if (sunPosition.altitude <= 0) {
      console.log('Sun below horizon, point is in shadow');
      return true;
    }

    // Get a larger radius for buildings to check (500 meters)
    const nearbyBuildings = getNearbyBuildings(map, point, 500);
    console.log(`Found ${nearbyBuildings.length} buildings to check for shadows`);
    console.log(`Sun bearing: ${sunPosition.azimuthDegrees}°, altitude: ${sunPosition.altitudeDegrees}°`);

    if (nearbyBuildings.length === 0) {
      console.log('No buildings found nearby, point is in sunlight');
      return false;
    }
    
    // Calculate the ray from point towards the sun (opposite of sun azimuth)
    const rayBearing = (sunPosition.azimuthDegrees + 180) % 360;
    console.log(`Ray bearing (towards sun): ${rayBearing}°`);
    
    // Create a point feature for calculations
    const pointFeature = turf.point(point);
    
    // Create the ray (line) from the point towards the sun
    // Make it long enough to intersect with all potential buildings (2km should be plenty)
    const raySunEnd = turf.destination(pointFeature, 2, rayBearing, { units: 'kilometers' });
    const raySun = turf.lineString([point, raySunEnd.geometry.coordinates]);
    
    // For each building, check if it intersects with our ray
    let intersectingBuildings = 0;
    
    for (const building of nearbyBuildings) {
      try {
        // Skip buildings without height
        if (!building.properties || typeof building.properties.height !== 'number') {
          continue;
        }

        const buildingHeight = building.properties.height;
        if (buildingHeight <= 0) continue;
        
        // We need the building as a polygon for intersection
        const buildingGeom = building.geometry;
        if (!buildingGeom || buildingGeom.type !== 'Polygon') continue;
        
        // Check if ray intersects with building footprint
        try {
          const intersects = turf.booleanIntersects(raySun, building);
          
          if (intersects) {
            intersectingBuildings++;
            console.log(`Ray intersects with building (height: ${buildingHeight}m)`);
            
            // Now we need to determine if the building is tall enough to block the sun
            // Calculate distance to building (approximate)
            const buildingCenter = turf.centroid(building);
            const distanceToBuilding = turf.distance(pointFeature, buildingCenter, { units: 'meters' });
            
            // Angular height of the building from the point
            const angularHeightRadians = Math.atan2(buildingHeight, distanceToBuilding);
            const angularHeightDegrees = angularHeightRadians * (180 / Math.PI);
            
            console.log(`Building angular height: ${angularHeightDegrees.toFixed(2)}°, Sun altitude: ${sunPosition.altitudeDegrees.toFixed(2)}°`);
            
            // If the building's angular height is greater than the sun's altitude,
            // the building blocks the sun and the point is in shadow
            if (angularHeightDegrees > sunPosition.altitudeDegrees) {
              console.log(`Building blocks sun - point is in shadow`);
              return true;
            } else {
              console.log(`Building is too short or too far to cast shadow on point`);
            }
          }
        } catch (err) {
          console.error("Error checking intersection:", err);
          // Continue to next building
        }
      } catch (err) {
        console.error("Error processing building:", err);
        // Continue to the next building instead of failing completely
      }
    }
    
    console.log(`Checked ${intersectingBuildings} intersecting buildings, none block the sun`);
    return false;
  } catch (error) {
    console.error("Error in shadow calculation:", error);
    // If there's an error, assume the point is in sunlight (fail open)
    return false;
  }
}

/**
 * Checks if a given point is in direct sunlight, considering shadows from buildings
 * @returns {Object} containing the result and metadata about the calculation
 */
export function isPointInSunlightWithShadows(
  map: mapboxgl.Map,
  point: [number, number],
  sunPosition: SunPosition
): { inSunlight: boolean, method: string, details?: string } {
  try {
    // Check if sun is above horizon first
    if (sunPosition.altitude <= 0) {
      console.log("Sun is below horizon, point is in shadow");
      return { 
        inSunlight: false, 
        method: "astronomical",
        details: "Sun is below horizon"
      };
    }
    
    // Then check for building shadows
    console.log("Starting ray tracing calculation...");
    const startTime = performance.now();
    
    const isInShadow = isPointInBuildingShadow(map, point, sunPosition);
    
    const endTime = performance.now();
    const rayTracingTime = (endTime - startTime).toFixed(2);
    
    console.log(`Ray tracing completed in ${rayTracingTime}ms: ${isInShadow ? 'in shadow' : 'in sunlight'}`);
    
    return {
      inSunlight: !isInShadow,
      method: "ray-tracing",
      details: `Calculated with 3D ray tracing in ${rayTracingTime}ms`
    };
  } catch (error) {
    console.error("Error in shadow calculation, falling back to simple check:", error);
    // If shadow calculation fails, fall back to simple sunlight check
    return {
      inSunlight: isPointInSunlight(sunPosition),
      method: "fallback",
      details: "Ray tracing failed, using simple sun position check"
    };
  }
}

/**
 * Gets times for sunrise, sunset, etc. for a given date and location
 * Returns all time properties provided by SunCalc, adjusted to local timezone
 */
export function getSunTimes(date: Date, latitude: number, longitude: number) {
  // Get the times using SunCalc
  const times = SunCalc.getTimes(date, latitude, longitude);
  
  // All times returned by SunCalc:
  // - sunrise: sunrise (top edge of the sun appears on the horizon)
  // - sunriseEnd: sunrise ends (bottom edge of the sun touches the horizon)
  // - goldenHourEnd: morning golden hour (soft light) ends
  // - solarNoon: solar noon (sun is in the highest position)
  // - goldenHour: evening golden hour starts
  // - sunsetStart: sunset starts (bottom edge of the sun touches the horizon)
  // - sunset: sunset (sun disappears below the horizon)
  // - dusk: dusk (evening nautical twilight starts)
  // - nauticalDusk: nautical dusk (evening astronomical twilight starts)
  // - night: night starts (dark enough for astronomical observations)
  // - nadir: nadir (darkest moment of the night, sun is in the lowest position)
  // - nightEnd: night ends (morning astronomical twilight starts)
  // - nauticalDawn: nautical dawn (morning nautical twilight starts)
  // - dawn: dawn (morning nautical twilight ends, morning civil twilight starts)
  
  // SunCalc returns times in the local timezone of the browser
  // No need to adjust for timezone as SunCalc handles this internally
  
  // Return all the times for maximum flexibility
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    dawn: times.dawn,
    dusk: times.dusk,
    solarNoon: times.solarNoon,
    nadir: times.nadir,
    goldenHour: times.goldenHour,
    goldenHourEnd: times.goldenHourEnd,
    sunriseEnd: times.sunriseEnd,
    sunsetStart: times.sunsetStart,
    night: times.night,
    nightEnd: times.nightEnd,
    nauticalDawn: times.nauticalDawn,
    nauticalDusk: times.nauticalDusk
  };
} 