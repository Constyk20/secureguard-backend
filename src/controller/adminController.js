const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');
const { Server } = require('socket.io');

exports.listDevices = async (req, res) => {
  try {
    const devices = await Device.find().populate('user', 'rollNo name email');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.lockDevice = async (req, res) => {
  const { deviceId, reason } = req.body;

  try {
    const device = await Device.findOneAndUpdate(
      { deviceId },
      { isLocked: true, lastComplianceCheck: new Date() },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await AuditLog.create({
      action: 'MANUAL_LOCK',
      performedBy: req.user.id,
      targetDevice: device._id,
      reason,
      ipAddress: req.ip
    });

    // Emit lock command via Socket.IO
    if (device.socketId) {
      req.io.to(device.socketId).emit('enforce-lock', { reason });
    }

    res.json({ message: 'Device locked successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.wipeDevice = async (req, res) => {
  const { deviceId, reason } = req.body;

  try {
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await AuditLog.create({
      action: 'DEVICE_WIPE',
      performedBy: req.user.id,
      targetDevice: device._id,
      reason,
      ipAddress: req.ip
    });

    if (device.socketId) {
      req.io.to(device.socketId).emit('enforce-wipe', { reason });
    }

    await Device.deleteOne({ deviceId });

    res.json({ message: 'Device wiped successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};