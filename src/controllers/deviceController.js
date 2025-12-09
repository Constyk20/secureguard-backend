// src/controllers/deviceController.js
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');

// 1. Register Device (First app launch)
exports.registerDevice = async (req, res) => {
  const { deviceId, model, osVersion, appVersion } = req.body;
  const userId = req.user.id;

  try {
    console.log(`📱 Registering device: ${deviceId} for user: ${userId}`);

    // Check for existing device
    const existingDevice = await Device.findOne({ deviceId });
    
    if (existingDevice) {
      // Update existing device with new info
      existingDevice.model = model || existingDevice.model;
      existingDevice.osVersion = osVersion || existingDevice.osVersion;
      existingDevice.appVersion = appVersion || existingDevice.appVersion;
      existingDevice.lastComplianceCheck = new Date();
      
      await existingDevice.save();
      
      console.log('✅ Device already registered, updated info');
      
      return res.status(200).json({
        success: true,
        message: 'Device already registered',
        data: {
          deviceId: existingDevice.deviceId,
          isCompliant: existingDevice.isCompliant,
          isLocked: existingDevice.isLocked,
          geofenceStatus: existingDevice.geofenceStatus
        }
      });
    }

    // Create new device
    const device = new Device({
      user: userId,
      deviceId,
      model: model || 'Unknown Model',
      osVersion: osVersion || 'Unknown OS',
      appVersion: appVersion || '1.0.0',
      isCompliant: true,
      isLocked: false,
      lastComplianceCheck: new Date(),
      geofenceStatus: 'inside',
      violations: []
    });

    await device.save();

    await AuditLog.create({
      action: 'DEVICE_REGISTERED',
      performedBy: userId,
      targetDevice: device._id,
      reason: 'New device registration'
    });

    console.log('✅ Device registered successfully');

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: {
        deviceId: device.deviceId,
        isCompliant: device.isCompliant,
        isLocked: device.isLocked,
        geofenceStatus: device.geofenceStatus
      }
    });
  } catch (err) {
    console.error('❌ Register Device Error:', err);
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
    console.log(`📊 Compliance report from device: ${deviceId}`);
    console.log(`   Compliant: ${isCompliant}, Geofence: ${geofenceStatus}`);

    const device = await Device.findOne({ deviceId, user: userId });

    if (!device) {
      console.log('❌ Device not found or not owned by user');
      return res.status(404).json({
        success: false,
        message: 'Device not found or not owned by user'
      });
    }

    // Store previous state to detect changes
    const wasCompliant = device.isCompliant;
    const wasLocked = device.isLocked;

    // Update device status
    device.isCompliant = isCompliant;
    device.isLocked = !isCompliant || device.isLocked; // Keep locked if admin locked it
    device.lastComplianceCheck = new Date();
    device.geofenceStatus = geofenceStatus;
    device.violations = violations;

    await device.save();

    // Auto-lock & log if non-compliant
    if (!isCompliant && wasCompliant) {
      console.log('⚠️ Device became non-compliant, triggering auto-lock');
      
      await AuditLog.create({
        action: 'AUTO_LOCK_TRIGGERED',
        performedBy: null, // system-triggered
        targetDevice: device._id,
        reason: violations.join(', ') || 'Compliance violation'
      });

      // Emit real-time lock command via Socket.IO (if connected)
      if (device.socketId && req.io) {
        console.log(`📤 Sending lock command to socket: ${device.socketId}`);
        req.io.to(device.socketId).emit('enforce-lock', {
          reason: violations.join(', ') || 'Security policy violation',
          violations,
          timestamp: new Date()
        });
      }
    }

    console.log('✅ Compliance status updated');

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
    console.error('❌ Report Compliance Error:', err);
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
    console.log(`🔍 Fetching device status for user: ${req.user.id}`);

    const device = await Device.findOne({ user: req.user.id })
      .populate('user', 'rollNo name email')
      .select('-socketId -__v');

    if (!device) {
      console.log('❌ No device registered for this user');
      return res.status(404).json({
        success: false,
        message: 'No device registered for this user'
      });
    }

    console.log('✅ Device status retrieved');

    res.json({
      success: true,
      data: {
        deviceId: device.deviceId,
        model: device.model,
        osVersion: device.osVersion,
        appVersion: device.appVersion,
        isCompliant: device.isCompliant,
        isLocked: device.isLocked,
        lockReason: device.lockReason,
        geofenceStatus: device.geofenceStatus,
        violations: device.violations || [],
        lastComplianceCheck: device.lastComplianceCheck,
        user: {
          rollNo: device.user.rollNo,
          name: device.user.name,
          email: device.user.email
        }
      }
    });
  } catch (err) {
    console.error('❌ Get Device Status Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device status',
      error: err.message
    });
  }
};