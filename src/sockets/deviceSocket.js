const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');

const setupDeviceSocket = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Device connected: ${socket.user.rollNo}`);

    // Register device online
    Device.updateOne(
      { 'user': socket.user.id },
      { $set: { socketId: socket.id, lastComplianceCheck: new Date() } }
    ).exec();

    // Receive compliance report from mobile app
    socket.on('compliance-report', async (report) => {
      const device = await Device.findOneAndUpdate(
        { user: socket.user.id },
        {
          isCompliant: report.isCompliant,
          isLocked: !report.isCompliant,
          lastComplianceCheck: new Date(),
          geofenceStatus: report.geofenceStatus || 'inside'
        },
        { new: true }
      );

      if (!report.isCompliant) {
        socket.emit('enforce-lock', {
          reason: report.reason || 'Security violation detected',
          violations: report.violations
        });

        await AuditLog.create({
          action: 'AUTO_LOCK',
          performedBy: null,
          targetDevice: device._id,
          reason: report.reason
        });
      }
    });

    socket.on('disconnect', async () => {
      await Device.updateOne(
        { user: socket.user.id },
        { $unset: { socketId: "" } }
      );
      console.log(`Device disconnected: ${socket.user.rollNo}`);
    });
  });
};

module.exports = setupDeviceSocket;