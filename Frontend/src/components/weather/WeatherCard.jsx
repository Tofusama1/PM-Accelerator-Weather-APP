import React from 'react';
import { MapPin, Calendar, Edit, Trash2, Eye, AlertCircle } from 'lucide-react';

const WeatherCard = ({ data, onView, onEdit, onDelete }) => {
  // Add safety checks for data structure
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  // The weather data structure from your API response
  const weatherInfo = data.weather_data;
  const hasWeatherData = weatherInfo && weatherInfo.weather_data && weatherInfo.weather_data.length > 0;
  const currentWeather = hasWeatherData ? weatherInfo.weather_data[0] : null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-lg transition-all duration-200 hover:border-blue-300">
      {/* Header with location */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-800">
            {weatherInfo?.location || data.location}
            {weatherInfo?.country ? `, ${weatherInfo.country}` : ''}
          </h3>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-1">
          {onView && (
            <button
              onClick={onView}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="View Details"
            >
              <Eye size={16} />
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
              title="Edit Record"
            >
              <Edit size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Delete Record"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
        <Calendar size={14} />
        <span>
          {new Date(data.start_date).toLocaleDateString()} to {new Date(data.end_date).toLocaleDateString()}
        </span>
      </div>

      {/* Weather data */}
      {hasWeatherData ? (
        <div className="current-weather">
          <div className="flex items-center gap-4 mb-4">
            <img 
              src={`https://openweathermap.org/img/wn/${currentWeather.weather_icon}@2x.png`} 
              alt={currentWeather.weather_description}
              className="w-12 h-12"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div>
              <div className="text-3xl font-bold text-gray-800">
                {Math.round(currentWeather.temperature)}°C
              </div>
              <div className="text-sm text-gray-600 capitalize">
                {currentWeather.weather_description}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3 text-sm mb-3">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg">
              <div className="text-blue-600 font-medium">Feels like</div>
              <div className="font-bold text-gray-800">{Math.round(currentWeather.feels_like)}°C</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg">
              <div className="text-green-600 font-medium">Humidity</div>
              <div className="font-bold text-gray-800">{currentWeather.humidity}%</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg">
              <div className="text-purple-600 font-medium">Wind</div>
              <div className="font-bold text-gray-800">{currentWeather.wind_speed} m/s</div>
            </div>
          </div>

          {/* Show total days of data available */}
          <div className="mt-3 text-xs text-gray-500 text-center bg-gray-50 py-2 rounded-md">
            {weatherInfo.weather_data.length} days of weather data available
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <AlertCircle size={32} className="mx-auto mb-2 text-gray-400" />
          <p>Weather data not available</p>
        </div>
      )}

      {/* Status indicator */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-500">ID: {data.id}</span>
          <span className={`px-3 py-1 rounded-full font-medium ${
            hasWeatherData 
              ? 'bg-green-100 text-green-700' 
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {hasWeatherData ? '✓ Complete' : '⏳ Pending'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default WeatherCard;