// =====================================================
// VEHICLE PARTS CHATBOT API - SERVER
// File: api/server.js
// Purpose: Main Express server with all routes
// =====================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// =====================================================
// IMPORT ROUTES
// =====================================================
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const workshopRoutes = require('./routes/workshops');
const orderRoutes = require('./routes/orders');

// =====================================================
// HEALTH CHECK & ROOT ENDPOINTS (Before other routes)
// =====================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vehicle Parts Chatbot API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      customers: '/api/customers',
      products: '/api/products',
      workshops: '/api/workshops',
      orders: '/api/orders'
    }
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Vehicle Parts Chatbot API',
    version: '1.0.0',
    documentation: '/health'
  });
});

// =====================================================
// REGISTER API ROUTES
// =====================================================
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/orders', orderRoutes);

// =====================================================
// ERROR HANDLING - MUST BE LAST!
// =====================================================

// 404 handler - catches unmatched routes
// This MUST come BEFORE the error handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Error handler - catches errors from routes
// This MUST be the VERY LAST middleware
// Note: Error handlers have 4 parameters (err, req, res, next)
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 Vehicle Parts Chatbot API Server Started');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('📚 Available Endpoints:');
  console.log(`   • Customers:  http://localhost:${PORT}/api/customers`);
  console.log(`   • Products:   http://localhost:${PORT}/api/products`);
  console.log(`   • Workshops:  http://localhost:${PORT}/api/workshops`);
  console.log(`   • Orders:     http://localhost:${PORT}/api/orders`);
  console.log('='.repeat(50));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// =====================================================
// KEY CONCEPTS - MIDDLEWARE ORDER MATTERS!
// =====================================================
/*
EXPRESS MIDDLEWARE ORDER (CRITICAL):

1. Body parsers (express.json(), express.urlencoded())
2. Logging middleware
3. Specific routes (/health, /)
4. API routes (/api/*)
5. 404 handler (catches unmatched routes)
6. Error handler (catches errors - must have 4 params)

WHY THIS ORDER?
- Express checks middleware in order from top to bottom
- Once a middleware sends a response (res.json, res.send), it stops
- 404 handler must come AFTER all routes (or valid routes will be caught as 404)
- Error handler must be LAST (or it won't catch errors from previous middleware)

WRONG ORDER EXAMPLE:
app.use(errorHandler);  // ❌ Too early!
app.use('/api/products', productRoutes);  // This will never be reached if error

CORRECT ORDER:
app.use('/api/products', productRoutes);  // ✅ Routes first
app.use((req, res) => { 404 handler });   // ✅ 404 after routes
app.use(errorHandler);                     // ✅ Error handler last
*/
