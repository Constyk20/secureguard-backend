const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');

const setupDeviceSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('❌ Socket connection rejected: No token provided');
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      console.log(`✅ Socket authenticated for user: ${decoded.rollNo || decoded.id}`);
      next();
    } catch (err) {
      console.log('❌ Socket connection rejected: Invalid token');
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Device connected: ${socket.user.rollNo || socket.user.id} (Socket: ${socket.id})`);

    // Handle device registration
    socket.on('register-device', async (data) => {
      try {
        const { deviceId } = data;
        console.log(`📱 Registering device: ${deviceId} for user: ${socket.user.id}`);

        const device = await Device.findOneAndUpdate(
          { user: socket.user.id, deviceId },
          { 
            socketId: socket.id,
            isConnected: true,
            lastSeen: new Date(),
            lastComplianceCheck: new Date()
          },
          { new: true, upsert: false }
        );

        if (device) {
          console.log(`✅ Device registered: ${deviceId}`);
          socket.emit('registration-confirmed', {
            success: true,
            message: 'Device registered successfully',
            deviceStatus: {
              isLocked: device.isLocked,
              isCompliant: device.isCompliant,
              lockReason: device.lockReason
            }
          });
        } else {
          console.log(`⚠️ Device not found: ${deviceId}`);
          socket.emit('registration-error', {
            success: false,
            message: 'Device not found. Please register first.'
          });
        }
      } catch (error) {
        console.error('❌ Device registration error:', error);
        socket.emit('registration-error', {
          success: false,
          message: error.message
        });
      }
    });

    // Receive compliance report from mobile app
    socket.on('compliance-report', async (report) => {
      try {
        console.log(`📊 Compliance report received from ${socket.user.rollNo}:`, {
          isCompliant: report.isCompliant,
          geofenceStatus: report.geofenceStatus,
          violations: report.violations?.length || 0
        });

        const device = await Device.findOneAndUpdate(
          { user: socket.user.id },
          {
            isCompliant: report.isCompliant,
            isLocked: !report.isCompliant || undefined, // Keep admin locks
            lastComplianceCheck: new Date(),
            geofenceStatus: report.geofenceStatus || 'inside',
            violations: report.violations || [],
            lastSeen: new Date()
          },
          { new: true }
        );

        if (!device) {
          console.log('⚠️ Device not found for compliance report');
          return;
        }

        // Auto-lock if non-compliant
        if (!report.isCompliant) {
          console.log(`⚠️ Device non-compliant, enforcing lock: ${device.deviceId}`);
          
          socket.emit('enforce-lock', {
            reason: report.reason || 'Security violation detected',
            violations: report.violations || [],
            timestamp: new Date()
          });

          await AuditLog.create({
            action: 'AUTO_LOCK_TRIGGERED',
            performedBy: null, // system-triggered
            targetDevice: device._id,
            reason: report.reason || report.violations?.join(', ') || 'Compliance violation'
          });

          console.log(`🔒 Auto-lock enforced for device: ${device.deviceId}`);
        } else {
          console.log(`✅ Device compliant: ${device.deviceId}`);
        }

        // Send acknowledgment
        socket.emit('compliance-ack', {
          success: true,
          timestamp: new Date(),
          deviceStatus: {
            isCompliant: device.isCompliant,
            isLocked: device.isLocked,
            geofenceStatus: device.geofenceStatus
          }
        });
      } catch (error) {
        console.error('❌ Compliance report error:', error);
        socket.emit('compliance-error', {
          success: false,
          message: error.message
        });
      }
    });

    // Heartbeat to keep connection alive
    socket.on('heartbeat', async () => {
      try {
        await Device.updateOne(
          { user: socket.user.id, socketId: socket.id },
          { lastSeen: new Date() }
        );
        
        socket.emit('heartbeat-ack', { 
          timestamp: new Date() 
        });
      } catch (error) {
        console.error('❌ Heartbeat error:', error);
      }
    });

    // Ping response (when device is pinged by admin)
    socket.on('ping-response', async (data) => {
      try {
        console.log(`📍 Ping response from device: ${socket.user.rollNo}`);
        
        // Broadcast to admin dashboard
        io.emit('device-ping-response', {
          userId: socket.user.id,
          rollNo: socket.user.rollNo,
          timestamp: new Date(),
          location: data.location
        });
      } catch (error) {
        console.error('❌ Ping response error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      try {
        await Device.updateOne(
          { user: socket.user.id, socketId: socket.id },
          { 
            isConnected: false,
            lastSeen: new Date(),
            $unset: { socketId: "" }
          }
        );
        
        console.log(`🔌 Device disconnected: ${socket.user.rollNo || socket.user.id} - Reason: ${reason}`);
      } catch (error) {
        console.error('❌ Disconnect handler error:', error);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.user.rollNo}:`, error);
    });
  });

  // Global error handler
  io.engine.on('connection_error', (err) => {
    console.error('❌ Socket.IO connection error:', {
      code: err.code,
      message: err.message,
      context: err.context
    });
  });
};

module.exports = setupDeviceSocket;