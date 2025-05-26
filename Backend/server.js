const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;

//CORS
app.use(cors({
  origin: [
    'http://localhost:3000',  // Create React App default
    'http://localhost:5173',  // Vite default (your current frontend)
    'http://localhost:4173',  // Vite preview
    process.env.FRONTEND_URL  // Production URL from environment
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Database connection
const client = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Test database connection
client.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});
client.on('error', (err) => {
  console.error('Database connection error:', err);
});

// JWT middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

//connection to a Database
const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

// Input validation middleware
const validateWeatherData = (req, res, next) => {
  const { location, startDate, endDate } = req.body;
  
  if (!location || !validator.isLength(location.trim(), { min: 2, max: 100 })) {
    return res.status(400).json({ 
      error: 'Valid location is required (2-100 characters)' 
    });
  }
  
  if (!startDate || !validator.isDate(startDate)) {
    return res.status(400).json({ error: 'Valid start date is required' });
  }
  
  if (!endDate || !validator.isDate(endDate)) {
    return res.status(400).json({ error: 'Valid end date is required' });
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  if (start > end) {
    return res.status(400).json({ error: 'Start date must be before end date' });
  }
  
  if (end > new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)) {
    return res.status(400).json({ error: 'End date cannot be more than 14 days in the future' });
  }
  
  next();
};

// Database initialization
const initializeDatabase = async () => {
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create weather_records table without YouTube column
    await client.query(`
      CREATE TABLE IF NOT EXISTS weather_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        location VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        weather_data JSONB NOT NULL,
        maps_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weather_records_user_id ON weather_records(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weather_records_location ON weather_records(location);
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

// Location details function - FIXED
const getLocationDetails = async (location) => {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
      console.warn('OpenWeather API key not configured, using basic location data');
      return {
        city: location,
        state: '',
        country: 'Unknown',
        formatted_address: location
      };
    }
    
    // Get coordinates from location using OpenWeatherMap Geocoding API
    const geoResponse = await axios.get(
      `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`
    );
    
    if (geoResponse.data && geoResponse.data.length > 0) {
      const locationData = geoResponse.data[0];
      return {
        city: locationData.name,
        state: locationData.state || '',
        country: locationData.country,
        formatted_address: `${locationData.name}${locationData.state ? ', ' + locationData.state : ''}, ${locationData.country}`,
        coordinates: {
          lat: locationData.lat,
          lon: locationData.lon
        }
      };
    } else {
      // Fallback if no data found
      return {
        city: location,
        state: '',
        country: 'Unknown',
        formatted_address: location
      };
    }
  } catch (error) {
    console.error('Error fetching location details:', error);
    // Return basic info if API call fails
    return {
      city: location,
      state: '',
      country: 'Unknown',
      formatted_address: location
    };
  }
};

// Weather API integration - FIXED VERSION
const getWeatherData = async (location, days = 5) => {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
      throw new Error('OpenWeather API key not configured');
    }
    
    // Get coordinates from location
    const geoResponse = await axios.get(
      `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`
    );
    
    if (!geoResponse.data.length) {
      throw new Error('Location not found');
    }
    
    const { lat, lon } = geoResponse.data[0];
    
    // Get weather data - FIXED: Removed extra space after lat=
    const weatherResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
    );
    
    // Process and format weather data
    const weatherData = weatherResponse.data.list.slice(0, days * 8).map(item => ({
      date: item.dt_txt.split(' ')[0],
      time: item.dt_txt.split(' ')[1],
      temperature: Math.round(item.main.temp),
      feels_like: Math.round(item.main.feels_like),
      humidity: item.main.humidity,
      pressure: item.main.pressure,
      wind_speed: item.wind.speed,
      wind_direction: item.wind.deg,
      weather_main: item.weather[0].main,
      weather_description: item.weather[0].description,
      weather_icon: item.weather[0].icon,
      visibility: item.visibility / 1000, // Convert to km
      clouds: item.clouds.all
    }));
    
    return {
      location: geoResponse.data[0].name,
      country: geoResponse.data[0].country,
      coordinates: { lat, lon },
      weather_data: weatherData
    };
  } catch (error) {
    console.error('Weather API error:', error);
    throw new Error('Failed to fetch weather data');
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    
    const { username, email, password } = req.body;
    
    // Enhanced validation
    if (!username || !validator.isLength(username.trim(), { min: 3, max: 50 })) {
      console.log('Username validation failed:', username);
      return res.status(400).json({ 
        error: 'Username must be 3-50 characters long' 
      });
    }
    
    if (!email || !validator.isEmail(email)) {
      console.log('Email validation failed:', email);
      return res.status(400).json({ 
        error: 'Valid email is required' 
      });
    }
    
    if (!password || !validator.isLength(password, { min: 6 })) {
      console.log('Password validation failed');
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }
    
    // Check if user exists
    console.log('Checking if user exists...');
    const existingUser = await client.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.trim(), email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      console.log('User already exists');
      return res.status(400).json({ 
        error: 'Username or email already exists' 
      });
    }
    
    // Hash password
    console.log('Hashing password...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    console.log('Creating user...');
    const result = await client.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username.trim(), email.toLowerCase(), passwordHash]
    );
    
    const user = result.rows[0];
    console.log('User created successfully:', user.id);
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error details:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ 
        error: 'Username or email already exists' 
      });
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        error: 'Database connection failed' 
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const result = await client.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1 OR email = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Weather Routes (Protected)
app.get('/api/weather/current/:location', authenticateToken, async (req, res) => {
  try {
    const { location } = req.params;
    const weatherData = await getWeatherData(location, 1);
    res.json(weatherData);
  } catch (error) {
    console.error('Current weather error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/weather/forecast/:location', authenticateToken, async (req, res) => {
  try {
    const { location } = req.params;
    const days = parseInt(req.query.days) || 5;
    const weatherData = await getWeatherData(location, days);
    res.json(weatherData);
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CRUD Routes for Weather Records (Protected)
app.post('/api/weather-records', authenticateToken, validateWeatherData, async (req, res) => {
  try {
    const { location, startDate, endDate } = req.body;
    const userId = req.user.userId;
    
    console.log('Creating weather record for:', { location, startDate, endDate, userId });
    
    // Get weather data
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weatherData = await getWeatherData(location, daysDiff);
    const mapsData = await getLocationDetails(location);
    
    console.log('Weather and location data fetched successfully');
    
    // Save to database
    const result = await client.query(
      `INSERT INTO weather_records (user_id, location, start_date, end_date, weather_data, maps_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, location, start_date, end_date, created_at`,
      [userId, weatherData.location, startDate, endDate, JSON.stringify(weatherData), JSON.stringify(mapsData)]
    );
    
    console.log('Weather record created successfully:', result.rows[0].id);
    
    const record = {
      ...result.rows[0],
      weather_data: weatherData,
      maps_data: mapsData
    };
    
    res.status(201).json({
      message: 'Weather record created successfully',
      record: record
    });
  } catch (error) {
    console.error('Create weather record error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/weather-records', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const result = await client.query(
      `SELECT id, location, start_date, end_date, weather_data, maps_data, created_at, updated_at
       FROM weather_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await client.query(
      'SELECT COUNT(*) FROM weather_records WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      records: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get weather records error:', error);
    res.status(500).json({ error: 'Failed to fetch weather records' });
  }
});

app.get('/api/weather-records/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const result = await client.query(
      `SELECT * FROM weather_records WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Weather record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get weather record error:', error);
    res.status(500).json({ error: 'Failed to fetch weather record' });
  }
});

app.put('/api/weather-records/:id', authenticateToken, validateWeatherData, async (req, res) => {
  try {
    const { id } = req.params;
    const { location, startDate, endDate } = req.body;
    const userId = req.user.userId;
    
    // Check if record exists and belongs to user
    const existingRecord = await client.query(
      'SELECT id FROM weather_records WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Weather record not found' });
    }
    
    // Get updated weather data
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weatherData = await getWeatherData(location, daysDiff);
    const mapsData = await getLocationDetails(location);
    
    // Update record
    const result = await client.query(
      `UPDATE weather_records 
       SET location = $1, start_date = $2, end_date = $3, weather_data = $4, maps_data = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING id, location, start_date, end_date, updated_at`,
      [weatherData.location, startDate, endDate, JSON.stringify(weatherData), JSON.stringify(mapsData), id, userId]
    );
    
    const record = {
      ...result.rows[0],
      weather_data: weatherData,
      maps_data: mapsData
    };
    
    res.json({
      message: 'Weather record updated successfully',
      record: record
    });
  } catch (error) {
    console.error('Update weather record error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/weather-records/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const result = await client.query(
      'DELETE FROM weather_records WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Weather record not found' });
    }
    
    res.json({ message: 'Weather record deleted successfully' });
  } catch (error) {
    console.error('Delete weather record error:', error);
    res.status(500).json({ error: 'Failed to delete weather record' });
  }
});

// Export Routes
app.get('/api/export/:format', authenticateToken, async (req, res) => {
  try {
    const { format } = req.params;
    const userId = req.user.userId;
    
    const result = await client.query(
      'SELECT * FROM weather_records WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    const records = result.rows;
    
    switch (format.toLowerCase()) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=weather_data.json');
        res.json(records);
        break;
        
      case 'csv':
        const csvHeaders = 'ID,Location,Start Date,End Date,Created At,Weather Data Count\n';
        const csvRows = records.map(record => {
          const weatherData = typeof record.weather_data === 'string' 
            ? JSON.parse(record.weather_data) 
            : record.weather_data;
          return `${record.id},"${record.location}","${record.start_date}","${record.end_date}","${record.created_at}",${weatherData.weather_data?.length || 0}`;
        }).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=weather_data.csv');
        res.send(csvHeaders + csvRows);
        break;
        
      case 'xml':
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<weatherData>
${records.map(record => `  <record id="${record.id}">
    <location>${record.location}</location>
    <startDate>${record.start_date}</startDate>
    <endDate>${record.end_date}</endDate>
    <createdAt>${record.created_at}</createdAt>
  </record>`).join('\n')}
</weatherData>`;
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=weather_data.xml');
        res.send(xmlContent);
        break;
        
      default:
        res.status(400).json({ error: 'Unsupported export format' });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectToDatabase();
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`CORS origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await client.end();
  process.exit(0);
});

module.exports = app;
