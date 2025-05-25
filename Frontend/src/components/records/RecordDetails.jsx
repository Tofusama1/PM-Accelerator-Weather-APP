// src/components/records/RecordDetails.jsx
import React from 'react';

const RecordDetails = ({ record }) => {
  if (!record) return <p>No record selected.</p>;

  // Parse weather_data if it's a string, otherwise use as is
  let weatherData;
  try {
    weatherData = typeof record.weather_data === 'string' 
      ? JSON.parse(record.weather_data) 
      : record.weather_data;
  } catch (error) {
    console.error('Error parsing weather data:', error);
    return <p>Error loading weather data.</p>;
  }

  // Get the most recent weather entry (or first one if available)
  const currentWeather = weatherData?.weather_data?.[0];
  
  if (!currentWeather) {
    return (
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-xl font-bold mb-2">{record.location}</h2>
        <p><strong>From:</strong> {new Date(record.start_date).toLocaleDateString()}</p>
        <p><strong>To:</strong> {new Date(record.end_date).toLocaleDateString()}</p>
        <p>No weather data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow p-4 rounded-lg">
      <h2 className="text-xl font-bold mb-2">{weatherData.location || record.location}</h2>
      <p><strong>Country:</strong> {weatherData.country || 'N/A'}</p>
      <p><strong>From:</strong> {new Date(record.start_date).toLocaleDateString()}</p>
      <p><strong>To:</strong> {new Date(record.end_date).toLocaleDateString()}</p>
      
      <div className="mt-4">
        <h3 className="text-lg font-semibold mb-2">Current Weather</h3>
        <p><strong>Date:</strong> {currentWeather.date}</p>
        <p><strong>Temperature:</strong> {currentWeather.temperature}°C</p>
        <p><strong>Feels Like:</strong> {currentWeather.feels_like}°C</p>
        <p><strong>Humidity:</strong> {currentWeather.humidity}%</p>
        <p><strong>Pressure:</strong> {currentWeather.pressure} hPa</p>
        <p><strong>Wind Speed:</strong> {currentWeather.wind_speed} m/s</p>
        <p><strong>Wind Direction:</strong> {currentWeather.wind_direction}°</p>
        <p><strong>Cloudiness:</strong> {currentWeather.clouds}%</p>
        <p><strong>Visibility:</strong> {currentWeather.visibility} km</p>
        <p><strong>Weather:</strong> {currentWeather.weather_main} - {currentWeather.weather_description}</p>
      </div>

      {weatherData.coordinates && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Location Details</h3>
          <p><strong>Latitude:</strong> {weatherData.coordinates.lat}</p>
          <p><strong>Longitude:</strong> {weatherData.coordinates.lon}</p>
        </div>
      )}

      <div className="mt-4">
        <p><strong>Total Weather Entries:</strong> {weatherData.weather_data?.length || 0}</p>
        <p><strong>Record Created:</strong> {new Date(record.created_at).toLocaleString()}</p>
        {record.updated_at !== record.created_at && (
          <p><strong>Last Updated:</strong> {new Date(record.updated_at).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
};

export default RecordDetails;