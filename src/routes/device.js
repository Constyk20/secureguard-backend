// src/routes/device.js
const express = require('express');
const router = express.Router();
const { 
  registerDevice, 
  reportCompliance, 
  getDeviceStatus 
} = require('../controllers/deviceController');
const authMiddleware = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array().map(e => e.msg)
    });
  }
  next();
};

// Register device on first app launch
router.post(
  '/register',
  authMiddleware,
  [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('model').optional().isString(),
    body('osVersion').optional().isString(),
    body('appVersion').optional().isString(),
  ],
  validate,
  registerDevice
);

// Report compliance (called every 30 sec or on change)
router.post(
  '/report',
  authMiddleware,
  [
    body('deviceId').notEmpty(),
    body('isCompliant').isBoolean(),
    body('violations').optional().isArray(),
    body('geofenceStatus').optional().isIn(['inside', 'outside']),
  ],
  validate,
  reportCompliance
);

// Get current device status
router.get('/status', authMiddleware, getDeviceStatus);

module.exports = router;