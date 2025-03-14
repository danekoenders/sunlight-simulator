import mapboxgl from "mapbox-gl";
import { SunPosition } from "../../lib/sunUtils";

// Simplified sun visualization using HTML/CSS instead of Three.js for better performance
export class SunMarker {
  private marker: mapboxgl.Marker;
  private sunElement: HTMLDivElement;
  private beamElement: HTMLDivElement | null = null;
  private map: mapboxgl.Map | null = null;
  private selectedPoint: mapboxgl.LngLat | null = null;

  constructor() {
    // Create sun element
    this.sunElement = document.createElement("div");
    this.sunElement.className = "sun-marker";
    this.sunElement.innerHTML = `
      <div class="sun-circle"></div>
      <div class="sun-glow"></div>
    `;

    // Create marker with the sun element
    this.marker = new mapboxgl.Marker({
      element: this.sunElement,
      anchor: "center",
      offset: [0, 0],
      rotation: 0,
      // Important for performance: reduce drag impact
      draggable: false,
      // Important for performance: don't pitch with map
      pitchAlignment: "viewport",
      // Important for performance: don't rotate with map
      rotationAlignment: "viewport",
    });
  }

  addTo(map: mapboxgl.Map): this {
    this.map = map;
    return this;
  }

  updatePosition(sunPosition: SunPosition, mapCenter: mapboxgl.LngLat): this {
    if (!this.map) return this;

    // Hide the sun if it's below the horizon
    if (sunPosition.altitude <= 0) {
      this.sunElement.style.display = "none";
      if (this.beamElement) {
        this.beamElement.style.display = "none";
      }
      return this;
    }

    // Show the sun if it's above the horizon
    this.sunElement.style.display = "block";

    // Get map bounds
    const bounds = this.map.getBounds();
    if (!bounds) {
      console.error("Could not get map bounds");
      return this;
    }

    const mapWidth = bounds.getEast() - bounds.getWest();
    const mapHeight = bounds.getNorth() - bounds.getSouth();

    // Calculate realistic sun position based on altitude and azimuth
    // Since the sun is effectively infinitely far away, we calculate a position
    // at the edge of the view field in the correct direction

    // Convert altitude to a normalized value (0-1) for position scaling
    // This ensures sun is still visible when low on horizon
    const altitudeFactor = Math.sin(sunPosition.altitude);

    // Calculate the direction vector toward the sun
    const directionX =
      Math.sin(sunPosition.azimuth) * Math.cos(sunPosition.altitude);
    const directionY =
      Math.cos(sunPosition.azimuth) * Math.cos(sunPosition.altitude);

    // Calculate a distance factor that places the sun just inside the map view
    // First get the current map canvas dimensions
    const mapCanvas = this.map.getCanvas();
    const canvasWidth = mapCanvas.width;
    const canvasHeight = mapCanvas.height;

    // Calculate the position vector magnitude needed to reach the edge of view
    const mapCenterViewport = this.map.project(mapCenter);
    const edge = Math.min(canvasWidth, canvasHeight) * 0.45; // Use 45% of the smaller dimension

    // Calculate new LngLat based on the sun direction but constrained to the edge distance
    const newLng = mapCenter.lng + directionX * mapWidth * 0.5;
    const newLat = mapCenter.lat + directionY * mapHeight * 0.5;

    // Set marker position
    this.marker.setLngLat([newLng, newLat]);
    this.marker.addTo(this.map);

    // Change sun color and size based on altitude
    const sunCircle = this.sunElement.querySelector(
      ".sun-circle"
    ) as HTMLElement;
    const sunGlow = this.sunElement.querySelector(".sun-glow") as HTMLElement;

    if (sunPosition.altitude < 0.1) {
      // Sunrise/sunset
      sunCircle.style.backgroundColor = "#FF8C00";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 140, 0, 0.7)";

      // Make sun slightly larger at sunrise/sunset for visual effect
      sunCircle.style.width = "24px";
      sunCircle.style.height = "24px";
      sunGlow.style.width = "24px";
      sunGlow.style.height = "24px";
    } else if (sunPosition.altitude < 0.3) {
      // Morning/evening
      sunCircle.style.backgroundColor = "#FFD700";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 215, 0, 0.6)";

      // Normal size
      sunCircle.style.width = "20px";
      sunCircle.style.height = "20px";
      sunGlow.style.width = "20px";
      sunGlow.style.height = "20px";
    } else {
      // Midday
      sunCircle.style.backgroundColor = "#FFFF00";
      sunGlow.style.boxShadow = "0 0 20px 10px rgba(255, 255, 0, 0.5)";

      // Normal size
      sunCircle.style.width = "20px";
      sunCircle.style.height = "20px";
      sunGlow.style.width = "20px";
      sunGlow.style.height = "20px";
    }

    // Update beam if we have a selected point
    this.updateBeam();

    return this;
  }

  setSelectedPoint(lngLat: mapboxgl.LngLat | null): this {
    this.selectedPoint = lngLat;
    this.updateBeam();
    return this;
  }

  private updateBeam(): void {
    if (!this.map || !this.selectedPoint) {
      if (this.beamElement) {
        this.beamElement.style.display = "none";
      }
      return;
    }

    // Create beam element if it doesn't exist
    if (!this.beamElement) {
      this.beamElement = document.createElement("div");
      this.beamElement.className = "sun-beam";
      this.map.getCanvasContainer().appendChild(this.beamElement);
    }

    const sunPosition = this.marker.getLngLat();
    const mapCanvas = this.map.getCanvas();

    // Convert geographical positions to pixel positions
    const sunPixel = this.map.project(sunPosition);
    const pointPixel = this.map.project(this.selectedPoint);

    // Calculate beam dimensions and position
    const length = Math.sqrt(
      Math.pow(sunPixel.x - pointPixel.x, 2) +
        Math.pow(sunPixel.y - pointPixel.y, 2)
    );

    // Calculate angle
    const angle =
      Math.atan2(pointPixel.y - sunPixel.y, pointPixel.x - sunPixel.x) *
      (180 / Math.PI);

    // Position and size beam
    this.beamElement.style.display = "block";
    this.beamElement.style.width = `${length}px`;
    this.beamElement.style.height = "2px";
    this.beamElement.style.left = `${sunPixel.x}px`;
    this.beamElement.style.top = `${sunPixel.y}px`;
    this.beamElement.style.transformOrigin = "0 0";
    this.beamElement.style.transform = `rotate(${angle}deg)`;
  }

  remove(): void {
    this.marker.remove();
    if (this.beamElement && this.beamElement.parentNode) {
      this.beamElement.parentNode.removeChild(this.beamElement);
    }
    this.beamElement = null;
  }
} 