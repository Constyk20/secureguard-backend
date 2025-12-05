require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/device');
const adminRoutes = require('./routes/admin');
const setupDeviceSocket = require('./sockets/deviceSocket');

connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/admin', adminRoutes(io));

// Socket.IO for real-time enforcement
setupDeviceSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`SecureGuard Backend Running on PORT ${PORT}`);
});