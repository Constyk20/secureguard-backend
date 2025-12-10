require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const setupDeviceSocket = require('./sockets/deviceSocket');

connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO Configuration with better settings
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.CLIENT_URL, 'https://secureguard-admin.onrender.com']
      : "*",
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS Configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.CLIENT_URL, 'https://secureguard-admin.onrender.com']
    : "*",
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Middleware
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SecureGuard Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      devices: '/api/device',
      admin: '/api/admin'
    }
  });
});

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    socketConnections: io.engine.clientsCount
  });
});

// API Routes - FIXED: Import and use routes properly
const deviceRoutes = require('./routes/device')(io);
const adminRoutes = require('./routes/admin')(io);

app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/admin', adminRoutes);

// Log all registered routes (helpful for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('\n📋 Registered Routes:');
  app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
      console.log(`  ${Object.keys(r.route.methods).join(', ').toUpperCase()} ${r.route.path}`);
    } else if (r.name === 'router') {
      r.handle.stack.forEach((handler) => {
        if (handler.route) {
          const route = handler.route;
          const method = Object.keys(route.methods).join(', ').toUpperCase();
          console.log(`  ${method} ${r.regexp.source.replace('\\/?', '').replace('(?=\\/|$)', '')}${route.path}`);
        }
      });
    }
  });
  console.log('\n');
}

// Socket.IO setup
setupDeviceSocket(io);

// Socket.IO connection monitoring
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} - Reason: ${reason}`);
  });
  
  socket.on('error', (error) => {
    console.error(`❌ Socket error: ${socket.id}`, error);
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 Handler - Must be AFTER all routes
app.use('*', (req, res) => {
  console.log(`⚠️  404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    availableEndpoints: {
      root: 'GET /',
      health: 'GET /health',
      auth: '/api/auth/*',
      devices: '/api/device/*',
      admin: '/api/admin/*'
    }
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`=== SecureGuard Backend ===`);
  console.log(`🚀 Server Running on PORT ${PORT}`);
  console.log(`🔌 Socket.IO Enabled`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`===========================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});