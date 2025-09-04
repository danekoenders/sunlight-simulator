import React, { useState, useEffect, useCallback } from 'react';
import { getSunTimes } from '../lib/sunUtils';

interface TimeSliderProps {
  date: Date;
  latitude: number;
  longitude: number;
  onTimeChange: (newTime: Date) => void;
}

interface SunTimes {
  sunrise: Date;
  sunset: Date;
  dawn: Date;
  dusk: Date;
  solarNoon: Date;
  nadir: Date;
  goldenHour: Date;
  goldenHourEnd: Date;
  sunriseEnd: Date;
  sunsetStart: Date;
  night: Date;
  nightEnd: Date;
  nauticalDawn: Date;
  nauticalDusk: Date;
}

const TimeSlider: React.FC<TimeSliderProps> = ({ 
  date, 
  latitude, 
  longitude, 
  onTimeChange 
}) => {
  // State for the slider value (0-1440 minutes in a day)
  const [sliderValue, setSliderValue] = useState<number>(0); // Will be initialized in useEffect
  const [displayTime, setDisplayTime] = useState<string>('');
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  // Daylight window in minutes from 00:00; defaults to whole day
  const [sliderMin, setSliderMin] = useState<number>(0);
  const [sliderMax, setSliderMax] = useState<number>(1435);

  const minutesOfDay = useCallback((d: Date): number => {
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const roundTo5 = useCallback((m: number): number => Math.round(m / 5) * 5, []);
  const ceilTo5 = useCallback((m: number): number => Math.ceil(m / 5) * 5, []);
  const floorTo5 = useCallback((m: number): number => Math.floor(m / 5) * 5, []);
  const clamp = useCallback((v: number, min: number, max: number) => Math.max(min, Math.min(max, v)), []);

  // Format a Date object consistently for display
  const formatTimeForDisplay = useCallback((date: Date): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'N/A';
    }
    
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false // Use 24-hour format
    });
  }, []);

  // Update displayed time based on slider value
  const updateDisplayTime = useCallback((minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    // Format as HH:MM with leading zeros
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = mins.toString().padStart(2, '0');
    
    setDisplayTime(`${formattedHours}:${formattedMinutes}`);
  }, []);

  // Initialize slider with the current time from props - only run once on mount or when date changes
  useEffect(() => {
    if (!date) return;
    
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    // We'll clamp to daylight window once we compute it below
    const roundedMinutes = roundTo5(totalMinutes);
    setSliderValue(roundedMinutes);
    updateDisplayTime(roundedMinutes);
    setInitialized(true);
  }, [date, updateDisplayTime, roundTo5]);
  
  // Fetch sun times when location changes - separate from the slider initialization
  useEffect(() => {
    if (!initialized) return;
    try {
      const times = getSunTimes(date, latitude, longitude);
      setSunTimes(times);

      // Compute daylight window and update slider bounds
      const valid = (d: Date | undefined) => d instanceof Date && !isNaN(d.getTime());
      if (valid(times.sunrise) && valid(times.sunset)) {
        let minM = minutesOfDay(times.sunrise);
        let maxM = minutesOfDay(times.sunset);
        // Normalize and snap to 5-minute grid
        minM = ceilTo5(clamp(minM, 0, 1435));
        maxM = floorTo5(clamp(maxM, 0, 1435));
        // Handle edge case where rounding crosses over
        if (maxM < minM) {
          // fallback to raw
          [minM, maxM] = [minutesOfDay(times.sunrise), minutesOfDay(times.sunset)];
          if (maxM < minM) {
            // polar day/night fallback: full day
            minM = 0;
            maxM = 1435;
          }
        }
        setSliderMin(minM);
        setSliderMax(maxM);
        // Clamp current value into new window
        setSliderValue((prev) => {
          const clamped = roundTo5(clamp(prev, minM, maxM));
          updateDisplayTime(clamped);
          return clamped;
        });
      } else {
        // No valid sunrise/sunset (polar night/day) -> allow full day
        setSliderMin(0);
        setSliderMax(1435);
        setSliderValue((prev) => {
          const clamped = roundTo5(clamp(prev, 0, 1435));
          updateDisplayTime(clamped);
          return clamped;
        });
      }
    } catch (error) {
      console.error("Error fetching sun times:", error);
    }
  }, [date, latitude, longitude, initialized, minutesOfDay, ceilTo5, floorTo5, clamp, roundTo5, updateDisplayTime]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = parseInt(e.target.value);
    // Snap to nearest 5 minutes
    const snapped = roundTo5(rawValue);
    // Clamp to daylight window
    const newValue = clamp(snapped, sliderMin, sliderMax);
    setSliderValue(newValue);
    updateDisplayTime(newValue);
    
    // Create a new date with the selected time
    const newDate = new Date(date);
    const hours = Math.floor(newValue / 60);
    const minutes = newValue % 60;
    
    newDate.setHours(hours, minutes, 0, 0);
    onTimeChange(newDate);
  }, [date, onTimeChange, updateDisplayTime, roundTo5, sliderMin, sliderMax, clamp]);

  // Calculate sunrise and sunset positions on the slider
  const getSunrisePosition = useCallback(() => {
    if (!sunTimes || !sunTimes.sunrise) return 0;
    const m = minutesOfDay(sunTimes.sunrise);
    if (sliderMax === sliderMin) return 0;
    return ((m - sliderMin) / (sliderMax - sliderMin)) * 100;
  }, [sunTimes, sliderMin, sliderMax, minutesOfDay]);

  const getSunsetPosition = useCallback(() => {
    if (!sunTimes || !sunTimes.sunset) return 0;
    const m = minutesOfDay(sunTimes.sunset);
    if (sliderMax === sliderMin) return 100;
    return ((m - sliderMin) / (sliderMax - sliderMin)) * 100;
  }, [sunTimes, sliderMin, sliderMax, minutesOfDay]);

  return (
    <div className="time-slider-container">
      <div className="time-info">
        <span className="current-time">{displayTime}</span>
      </div>
      
      <div className="slider-wrapper">
        <div className="slider-track">
          {sunTimes && (
            <>
              <div 
                className="sunrise-marker" 
                style={{ left: `${getSunrisePosition()}%` }}
                title={`Sunrise: ${formatTimeForDisplay(sunTimes.sunrise)}`}
              >
                ↑
              </div>
              <div 
                className="sunset-marker" 
                style={{ left: `${getSunsetPosition()}%` }}
                title={`Sunset: ${formatTimeForDisplay(sunTimes.sunset)}`}
              >
                ↓
              </div>
            </>
          )}
        </div>
        
        <input
          type="range"
          min={sliderMin}
          // Constrain to daylight window
          max={sliderMax}
          step={5}
          value={sliderValue}
          onChange={handleSliderChange}
          className="time-slider"
        />
      </div>
    </div>
  );
};

export default TimeSlider; 