import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import { Feature, GeoJsonProperties } from "geojson";
import { Ray3DPoint } from "./types";

// Update the calculate3DDestinationPoint function to return elevation as well
export const calculate3DDestinationPoint = (
  startPoint: [number, number], // [lng, lat]
  distance: number, // in kilometers
  azimuthDegrees: number,
  altitudeDegrees: number
): Ray3DPoint => {
  // Convert altitude to radians
  const altitudeRadians = (altitudeDegrees * Math.PI) / 180;

  // Adjust the distance based on the altitude angle
  // When altitude is 90° (directly overhead), horizontal distance is 0
  // When altitude is 0° (horizon), horizontal distance is the full distance
  const horizontalDistance = distance * Math.cos(altitudeRadians);

  // Calculate the vertical component of the ray
  // When altitude is 90° (directly overhead), vertical distance is the full distance
  // When altitude is 0° (horizon), vertical distance is 0
  const verticalDistance = distance * Math.sin(altitudeRadians);

  // Invert azimuth for ray tracing (from ground to sun)
  const inverseBearing = (azimuthDegrees + 180) % 360;

  // Calculate the destination point using the horizontal distance
  const destination = turf.destination(
    startPoint,
    horizontalDistance,
    inverseBearing,
    { units: "kilometers" }
  );

  // Ensure we return exactly [number, number] by extracting the coordinates
  const [lng, lat] = destination.geometry.coordinates;

  return {
    position: [lng, lat],
    elevation: verticalDistance * 1000, // Convert to meters for Mapbox elevation scale
  };
};

// Create 3D ray segments for visualization
export function createRay3DSegments(
  map: mapboxgl.Map,
  start: [number, number],
  end: [number, number],
  startElevation: number,
  endElevation: number,
  segments: number = 20
): Feature[] {
  const features: Feature[] = [];

  // Create multiple segments to form a 3D ray
  for (let i = 0; i < segments; i++) {
    const ratio1 = i / segments;
    const ratio2 = (i + 1) / segments;

    // Interpolate positions
    const lng1 = start[0] + (end[0] - start[0]) * ratio1;
    const lat1 = start[1] + (end[1] - start[1]) * ratio1;
    const elev1 = startElevation + (endElevation - startElevation) * ratio1;

    const lng2 = start[0] + (end[0] - start[0]) * ratio2;
    const lat2 = start[1] + (end[1] - start[1]) * ratio2;
    const elev2 = startElevation + (endElevation - startElevation) * ratio2;

    // Calculate a small rectangle around the line segment for extrusion
    const angle = Math.atan2(lat2 - lat1, lng2 - lng1);
    const perpAngle = angle + Math.PI / 2;

    // Width of the ray (in meters, converted to degrees)
    const widthMeters = 0.2;
    const widthDegrees =
      widthMeters / (111320 * Math.cos((lat1 * Math.PI) / 180));

    // Calculate corners of the rectangle
    const dx = (widthDegrees * Math.cos(perpAngle)) / 2;
    const dy = (widthDegrees * Math.sin(perpAngle)) / 2;

    // Create a polygon for this segment
    const segment: Feature = {
      type: "Feature",
      properties: {
        base: elev1,
        height: elev2,
        segment: i,
        isRaySegment: true,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [lng1 - dx, lat1 - dy],
            [lng1 + dx, lat1 + dy],
            [lng2 + dx, lat2 + dy],
            [lng2 - dx, lat2 - dy],
            [lng1 - dx, lat1 - dy],
          ],
        ],
      },
    };

    features.push(segment);
  }

  return features;
} 