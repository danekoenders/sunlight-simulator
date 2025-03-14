import React, { useState, useEffect, useCallback } from 'react';
import { getSunTimes } from '../lib/sunUtils';

interface TimeSliderProps {
  date: Date;
  latitude: number;
  longitude: number;
  onTimeChange: (newTime: Date) => void;
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
  const [sunTimes, setSunTimes] = useState<any>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

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
    
    setSliderValue(totalMinutes);
    updateDisplayTime(totalMinutes);
    setInitialized(true);
  }, [date, updateDisplayTime]);
  
  // Fetch sun times when location changes - separate from the slider initialization
  useEffect(() => {
    if (!initialized) return;
    
    // Calculate sunrise and sunset times
    try {
      const times = getSunTimes(date, latitude, longitude);
      setSunTimes(times);
    } catch (error) {
      console.error("Error fetching sun times:", error);
    }
  }, [date, latitude, longitude, initialized]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    setSliderValue(newValue);
    updateDisplayTime(newValue);
    
    // Create a new date with the selected time
    const newDate = new Date(date);
    const hours = Math.floor(newValue / 60);
    const minutes = newValue % 60;
    
    newDate.setHours(hours, minutes, 0, 0);
    onTimeChange(newDate);
  }, [date, onTimeChange, updateDisplayTime]);

  // Calculate sunrise and sunset positions on the slider
  const getSunrisePosition = useCallback(() => {
    if (!sunTimes || !sunTimes.sunrise) return 0;
    const sunrise = sunTimes.sunrise;
    return (sunrise.getHours() * 60 + sunrise.getMinutes()) / 1440 * 100;
  }, [sunTimes]);

  const getSunsetPosition = useCallback(() => {
    if (!sunTimes || !sunTimes.sunset) return 0;
    const sunset = sunTimes.sunset;
    return (sunset.getHours() * 60 + sunset.getMinutes()) / 1440 * 100;
  }, [sunTimes]);

  return (
    <div className="time-slider-container">
      <div className="time-info">
        <span className="current-time">{displayTime}</span>
        {sunTimes && (
          <div className="sun-times">
            <span title="Sunrise">Sunrise: {formatTimeForDisplay(sunTimes.sunrise)}</span>
            <span title="Sunset">Sunset: {formatTimeForDisplay(sunTimes.sunset)}</span>
            <span title="Dawn">Dawn: {formatTimeForDisplay(sunTimes.dawn)}</span>
            <span title="Dusk">Dusk: {formatTimeForDisplay(sunTimes.dusk)}</span>
          </div>
        )}
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
          min="0"
          max="1439" // 23 hours and 59 minutes (0-based)
          value={sliderValue}
          onChange={handleSliderChange}
          className="time-slider"
        />
        
        <div className="time-labels">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  );
};

export default TimeSlider; 