const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const { auth } = require('../middleware/auth');

module.exports = (io) => {
  console.log('Socket.IO instance successfully set in device routes.');
  
  // Get device status
  router.get('/status/:deviceId', auth, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      res.json({
        success: true,
        device: {
          id: device._id,
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          lockdown: device.lockdown,
          battery: device.battery,
          location: device.location
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  });
  
  // Activate lockdown
  router.post('/lockdown/:deviceId', auth, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Update device status
      device.lockdown = {
        active: true,
        reason: req.body.reason || 'Security breach detected',
        activatedAt: new Date(),
        activatedBy: req.user._id
      };
      device.status = 'lockdown';
      
      await device.save();
      
      // Emit socket event
      io.to(device._id.toString()).emit('lockdown_activated', {
        deviceId: device._id,
        reason: device.lockdown.reason,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Lockdown activated successfully',
        device: device
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  });
  
  // Deactivate lockdown
  router.post('/unlock/:deviceId', auth, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Update device status
      device.lockdown = {
        active: false,
        reason: '',
        activatedAt: null,
        activatedBy: null,
        deactivatedAt: new Date(),
        deactivatedBy: req.user._id
      };
      device.status = 'active';
      
      await device.save();
      
      // Emit socket event
      io.to(device._id.toString()).emit('lockdown_deactivated', {
        deviceId: device._id,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Lockdown deactivated successfully',
        device: device
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  });
  
  // Send ping to device
  router.post('/ping/:deviceId', auth, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Emit ping event
      io.to(device._id.toString()).emit('ping_device', {
        deviceId: device._id,
        duration: req.body.duration || 30, // seconds
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        message: 'Ping command sent to device',
        deviceId: device._id
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  });
  
  // Update device location
  router.post('/location/:deviceId', auth, async (req, res) => {
    try {
      const device = await Device.findById(req.params.deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: 'Device not found' 
        });
      }
      
      // Update location
      device.location = {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
        timestamp: new Date()
      };
      
      await device.save();
      
      // Emit location update
      io.to(device._id.toString()).emit('location_updated', {
        deviceId: device._id,
        location: device.location
      });
      
      res.json({
        success: true,
        message: 'Location updated successfully',
        location: device.location
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  });
  
  return router;
};