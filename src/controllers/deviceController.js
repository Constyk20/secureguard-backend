// src/controllers/deviceController.js
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');

// 1. Register Device (First app launch)
exports.registerDevice = async (req, res) => {
  const { deviceId, model, osVersion, appVersion } = req.body;
  const userId = req.user.id;

  try {
    // Prevent duplicate registration
    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice) {
      return res.status(200).json({
        success: true,
        message: 'Device already registered',
        data: existingDevice
      });
    }

    const device = new Device({
      user: userId,
      deviceId,
      model,
      osVersion,
      appVersion,
      isCompliant: true,
      isLocked: false,
      lastComplianceCheck: new Date(),
      geofenceStatus: 'inside'
    });

    await device.save();

    await AuditLog.create({
      action: 'DEVICE_REGISTERED',
      performedBy: userId,
      targetDevice: device._id,
      reason: 'New device registration'
    });

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: device
    });
  } catch (err) {
    console.error('Register Device Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to register device',
      error: err.message
    });
  }
};

// 2. Report Compliance (Called every 30s or on change)
exports.reportCompliance = async (req, res) => {
  const { deviceId, isCompliant, violations = [], geofenceStatus = 'inside' } = req.body;
  const userId = req.user.id;

  try {
    const device = await Device.findOneAndUpdate(
      { deviceId, user: userId },
      {
        isCompliant,
        isLocked: !isCompliant,
        lastComplianceCheck: new Date(),
        geofenceStatus,
        $set: { violations } // optional: store last violations
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found or not owned by user'
      });
    }

    // Auto-lock & log if non-compliant
    if (!isCompliant) {
      await AuditLog.create({
        action: 'AUTO_LOCK_TRIGGERED',
        performedBy: null, // system-triggered
        targetDevice: device._id,
        reason: violations.join(', ') || 'Compliance violation'
      });

      // Emit real-time lock command via Socket.IO (if connected)
      if (device.socketId && req.io) {
        req.io.to(device.socketId).emit('enforce-lock', {
          reason: violations.join(', ') || 'Security policy violation',
          violations,
          timestamp: new Date()
        });
      }
    }

    res.json({
      success: true,
      message: 'Compliance status updated',
      data: {
        deviceId: device.deviceId,
        isCompliant: device.isCompliant,
        isLocked: device.isLocked,
        geofenceStatus: device.geofenceStatus,
        lastCheck: device.lastComplianceCheck
      }
    });
  } catch (err) {
    console.error('Report Compliance Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to report compliance',
      error: err.message
    });
  }
};

// 3. Get Current Device Status (For app to check lock state)
exports.getDeviceStatus = async (req, res) => {
  try {
    const device = await Device.findOne({ user: req.user.id })
      .populate('user', 'rollNo name email')
      .select('-socketId -__v');

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'No device registered for this user'
      });
    }

    res.json({
      success: true,
      data: {
        deviceId: device.deviceId,
        model: device.model,
        isCompliant: device.isCompliant,
        isLocked: device.isLocked,
        geofenceStatus: device.geofenceStatus,
        lastComplianceCheck: device.lastComplianceCheck,
        user: {
          rollNo: device.user.rollNo,
          name: device.user.name
        }
      }
    });
  } catch (err) {
    console.error('Get Device Status Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device status',
      error: err.message
    });
  }
};