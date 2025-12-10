const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

module.exports = (io) => {
  console.log('✅ Socket.IO instance set in device routes');
  
  // ---------------------------------------------------------------------------
  // REGISTER NEW DEVICE
  // ---------------------------------------------------------------------------
  router.post('/register', auth, async (req, res) => {
    try {
      console.log('📱 Device registration request from user:', req.user.id);
      console.log('📦 Request body:', req.body);
      
      const { deviceId, name, deviceInfo } = req.body;
      
      // Validate required fields
      if (!deviceId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device ID is required' 
        });
      }
      
      // Check if device already exists
      const existingDevice = await Device.findById(deviceId);
      if (existingDevice) {
        // Check if device belongs to another user
        if (existingDevice.user.toString() !== req.user.id) {
          return res.status(403).json({ 
            success: false, 
            message: 'Device already registered to another user' 
          });
        }
        
        // Device already registered to this user - update it
        if (name) existingDevice.name = name;
        if (deviceInfo) existingDevice.deviceInfo = deviceInfo;
        existingDevice.lastSeen = new Date();
        await existingDevice.save();
        
        console.log('✅ Device updated:', existingDevice._id);
        
        return res.json({
          success: true,
          message: 'Device already registered - updated successfully',
          device: {
            id: existingDevice._id,
            name: existingDevice.name,
            status: existingDevice.status,
            lastSeen: existingDevice.lastSeen,
            user: req.user.id
          }
        });
      }
      
      // Create new device
      const device = new Device({
        _id: deviceId,
        name: name || `Device-${deviceId.substring(0, 8)}`,
        user: req.user.id,
        status: 'active',
        lastSeen: new Date(),
        deviceInfo: deviceInfo || {}
      });
      
      await device.save();
      
      console.log('✅ New device registered:', device._id);
      
      // Add device to user's devices array
      await User.findByIdAndUpdate(
        req.user.id,
        { $addToSet: { devices: device._id } },
        { new: true }
      );
      
      res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          user: req.user.id,
          deviceInfo: device.deviceInfo
        }
      });
      
    } catch (error) {
      console.error('❌ Device registration error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // GET USER'S DEVICES
  // ---------------------------------------------------------------------------
  router.get('/my-devices', auth, async (req, res) => {
    try {
      const devices = await Device.find({ user: req.user.id })
        .sort({ lastSeen: -1 });
      
      const devicesWithStatus = devices.map(device => ({
        id: device._id,
        name: device.name,
        status: device.status,
        lastSeen: device.lastSeen,
        battery: device.battery,
        location: device.location,
        lockdown: device.lockdown,
        isOnline: device.isOnline,
        deviceInfo: device.deviceInfo,
        isCompliant: device.isCompliant,
        createdAt: device.createdAt
      }));
      
      res.json({
        success: true,
        count: devices.length,
        devices: devicesWithStatus
      });
    } catch (error) {
      console.error('❌ Get devices error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // GET DEVICE STATUS
  // ---------------------------------------------------------------------------
  router.get('/status/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      res.json({
        success: true,
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          battery: device.battery,
          location: device.location,
          lockdown: device.lockdown,
          isOnline: device.isOnline,
          deviceInfo: device.deviceInfo,
          isCompliant: device.isCompliant,
          settings: device.settings
        }
      });
    } catch (error) {
      console.error('❌ Get device status error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // ACTIVATE LOCKDOWN
  // ---------------------------------------------------------------------------
  router.post('/lockdown/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { reason } = req.body;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Check if already in lockdown
      if (device.lockdown.active) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device is already in lockdown' 
        });
      }
      
      // Activate lockdown
      await device.activateLockdown(reason, req.user.id);
      
      // Emit socket event
      io.to(deviceId).emit('lockdown_activated', {
        deviceId: device._id,
        reason: device.lockdown.reason,
        timestamp: new Date(),
        activatedBy: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Lockdown activated successfully',
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lockdown: device.lockdown
        }
      });
    } catch (error) {
      console.error('❌ Activate lockdown error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // DEACTIVATE LOCKDOWN
  // ---------------------------------------------------------------------------
  router.post('/unlock/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Check if not in lockdown
      if (!device.lockdown.active) {
        return res.status(400).json({ 
          success: false, 
          message: 'Device is not in lockdown' 
        });
      }
      
      // Deactivate lockdown
      await device.deactivateLockdown(req.user.id);
      
      // Emit socket event
      io.to(deviceId).emit('lockdown_deactivated', {
        deviceId: device._id,
        timestamp: new Date(),
        deactivatedBy: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Lockdown deactivated successfully',
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lockdown: device.lockdown
        }
      });
    } catch (error) {
      console.error('❌ Deactivate lockdown error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // SEND PING TO DEVICE
  // ---------------------------------------------------------------------------
  router.post('/ping/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { duration = 30 } = req.body;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Validate duration
      if (duration < 5 || duration > 300) {
        return res.status(400).json({ 
          success: false, 
          message: 'Duration must be between 5 and 300 seconds' 
        });
      }
      
      // Emit ping event
      io.to(deviceId).emit('ping_device', {
        deviceId: device._id,
        duration: parseInt(duration),
        timestamp: new Date(),
        initiatedBy: req.user.id
      });
      
      res.json({
        success: true,
        message: 'Ping command sent to device',
        deviceId: device._id,
        duration: parseInt(duration)
      });
    } catch (error) {
      console.error('❌ Ping device error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // UPDATE DEVICE LOCATION
  // ---------------------------------------------------------------------------
  router.post('/location/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { latitude, longitude, accuracy, address } = req.body;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Validate coordinates
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ 
          success: false, 
          message: 'Latitude and longitude are required' 
        });
      }
      
      // Update location
      device.location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 0,
        address: address || '',
        timestamp: new Date()
      };
      
      device.lastSeen = new Date();
      
      // Check geofence compliance
      const distance = calculateDistance(
        latitude, 
        longitude, 
        device.geofence.campusLat, 
        device.geofence.campusLng
      );
      
      device.geofence.isInsideGeofence = distance <= device.geofence.radius;
      device.isCompliant = device.geofence.isInsideGeofence && !device.lockdown.active;
      
      await device.save();
      
      // Emit location update
      io.to(deviceId).emit('location_updated', {
        deviceId: device._id,
        location: device.location,
        isInsideGeofence: device.geofence.isInsideGeofence,
        isCompliant: device.isCompliant,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Location updated successfully',
        location: device.location,
        isInsideGeofence: device.geofence.isInsideGeofence,
        isCompliant: device.isCompliant
      });
    } catch (error) {
      console.error('❌ Update location error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // UPDATE DEVICE HEARTBEAT
  // ---------------------------------------------------------------------------
  router.post('/heartbeat/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { battery } = req.body;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Update last seen
      device.lastSeen = new Date();
      
      // Update battery if provided
      if (battery) {
        device.battery = {
          level: Math.max(0, Math.min(100, parseInt(battery.level) || device.battery.level)),
          isCharging: battery.isCharging || false,
          lastUpdated: new Date()
        };
      }
      
      await device.save();
      
      res.json({
        success: true,
        message: 'Heartbeat received',
        lastSeen: device.lastSeen,
        battery: device.battery,
        isOnline: device.isOnline
      });
    } catch (error) {
      console.error('❌ Heartbeat error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // UPDATE DEVICE SETTINGS
  // ---------------------------------------------------------------------------
  router.put('/settings/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { settings } = req.body;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Update settings
      if (settings) {
        device.settings = {
          ...device.settings,
          ...settings
        };
      }
      
      await device.save();
      
      res.json({
        success: true,
        message: 'Device settings updated',
        settings: device.settings
      });
    } catch (error) {
      console.error('❌ Update settings error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // DELETE DEVICE
  // ---------------------------------------------------------------------------
  router.delete('/:deviceId', auth, async (req, res) => {
    try {
      const { deviceId } = req.params;
      
      const device = await Device.findById(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Check if user owns the device or is admin
      if (device.user.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
      
      // Remove device from user's devices array
      await User.findByIdAndUpdate(
        req.user.id,
        { $pull: { devices: deviceId } }
      );
      
      // Delete device
      await Device.findByIdAndDelete(deviceId);
      
      res.json({
        success: true,
        message: 'Device deleted successfully'
      });
    } catch (error) {
      console.error('❌ Delete device error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error' 
      });
    }
  });
  
  // ---------------------------------------------------------------------------
  // HELPER FUNCTION: Calculate distance between two coordinates
  // ---------------------------------------------------------------------------
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }
  
  return router;
};