import * as turf from "@turf/turf";
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
