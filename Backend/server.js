// server.js - Backend API Server
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

// Security middleware
app.use(helmet());

// CORS Configuration - FIXED: Only one CORS configuration
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

// Body parser middleware
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Database connection - FIXED: Better connection handling
const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  port: process.env.DB_PORT || 5432,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Database connection with better error handling
const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');
    
    // Test the connection
    const result = await client.query('SELECT NOW()');
    console.log('Database timestamp:', result.rows[0].now);
    
    return true;
  } catch (error) {
    console.error('Database connection error:', error.message);
    console.error('Connection details:', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER
    });
    throw error;
  }
};

// Database initialization with better error handling
const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');
    
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
    console.log('Users table ready');
    
    // Create weather_records table
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
    console.log('Weather records table ready');
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weather_records_user_id ON weather_records(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weather_records_location ON weather_records(location);
    `);
    console.log('Database indexes ready');
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
};

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

// Test endpoints for debugging
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    res.json({ 
      status: 'Database connected successfully', 
      current_time: result.rows[0].current_time,
      postgres_version: result.rows[0].postgres_version
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      status: 'Database connection failed', 
      error: error.message 
    });
  }
});

// FIXED: Enhanced registration route with better error handling and logging
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration request received');
    console.log('Request body:', { 
      username: req.body.username, 
      email: req.body.email, 
      passwordLength: req.body.password?.length 
    });
    
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
    
    // Test database connection before proceeding
    try {
      await client.query('SELECT 1');
      console.log('Database connection verified');
    } catch (dbError) {
      console.error('Database connection failed during registration:', dbError);
      return res.status(500).json({ 
        error: 'Database connection error. Please try again later.' 
      });
    }
    
    // Check if user exists
    console.log('Checking if user exists...');
    const existingUser = await client.query(
      'SELECT id, username, email FROM users WHERE username = $1 OR email = $2',
      [username.trim(), email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      console.log('User already exists:', { 
        id: existing.id, 
        username: existing.username, 
        email: existing.email 
      });
      
      if (existing.username === username.trim()) {
        return res.status(400).json({ error: 'Username already exists' });
      } else {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }
    
    console.log('User does not exist, proceeding with registration');
    
    // Hash password
    console.log('Hashing password...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log('Password hashed successfully');
    
    // Create user
    console.log('Creating user in database...');
    const result = await client.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username.trim(), email.toLowerCase(), passwordHash]
    );
    
    const user = result.rows[0];
    console.log('User created successfully:', { 
      id: user.id, 
      username: user.username, 
      email: user.email 
    });
    
    // Generate JWT
    console.log('Generating JWT token...');
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    console.log('JWT token generated');
    
    // Success response
    const response = {
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      token
    };
    
    console.log('Registration completed successfully');
    res.status(201).json(response);
    
  } catch (error) {
    console.error('Registration error details:', {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      console.error('Database unique constraint violation');
      return res.status(400).json({ 
        error: 'Username or email already exists' 
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('Database connection refused');
      return res.status(500).json({ 
        error: 'Database connection failed. Please contact support.' 
      });
    }
    
    if (error.code === '3D000') { // Invalid database name
      console.error('Database does not exist');
      return res.status(500).json({ 
        error: 'Database configuration error. Please contact support.' 
      });
    }
    
    if (error.code === '28P01') { // Invalid password
      console.error('Database authentication failed');
      return res.status(500).json({ 
        error: 'Database authentication error. Please contact support.' 
      });
    }
    
    // Generic server error
    res.status(500).json({ 
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// FIXED: Enhanced login route
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login request received for:', req.body.username);
    
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
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    console.log('User found:', { id: user.id, username: user.username });
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('Invalid password for user:', user.username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('Password verified for user:', user.username);
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('Login successful for user:', user.username);
    
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

// Location details function
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
      return {
        city: location,
        state: '',
        country: 'Unknown',
        formatted_address: location
      };
    }
  } catch (error) {
    console.error('Error fetching location details:', error);
    return {
      city: location,
      state: '',
      country: 'Unknown',
      formatted_address: location
    };
  }
};

// Weather API integration
const getWeatherData = async (location, days = 5) => {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
      throw new Error('OpenWeather API key not configured');
    }
    
    const geoResponse = await axios.get(
      `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`
    );
    
    if (!geoResponse.data.length) {
      throw new Error('Location not found');
    }
    
    const { lat, lon } = geoResponse.data[0];
    
    const weatherResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
    );
    
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
      visibility: item.visibility / 1000,
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
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weatherData = await getWeatherData(location, daysDiff);
    const mapsData = await getLocationDetails(location);
    
    console.log('Weather and location data fetched successfully');
    
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
    
    const existingRecord = await client.query(
      'SELECT id FROM weather_records WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Weather record not found' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weatherData = await getWeatherData(location, daysDiff);
    const mapsData = await getLocationDetails(location);
    
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('Starting server...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    
    // Connect to database first
    await connectToDatabase();
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🌟 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔗 Database test: http://localhost:${PORT}/api/test-db`);
      console.log(`🌐 CORS origins:`, [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:4173',
        process.env.FRONTEND_URL
      ].filter(Boolean));
      console.log('Server started successfully!');
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error('Please check your database configuration and ensure PostgreSQL is running.');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await client.end();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

startServer();

module.exports = app;
