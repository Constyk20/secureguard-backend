// src/routes/admin.js
const express = require('express');
const router = express.Router();
const { 
  listDevices, 
  lockDevice, 
  wipeDevice 
} = require('./controllers/adminController');
const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');
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

// Middleware to attach Socket.IO instance
const attachIO = (io) => (req, res, next) => {
  req.io = io;
  next();
};

// Admin-only routes
module.exports = (io) => {
  const withIO = attachIO(io);

  router.get('/devices', authMiddleware, adminMiddleware, listDevices);

  router.post(
    '/lock',
    authMiddleware,
    adminMiddleware,
    withIO,
    [
      body('deviceId').notEmpty().withMessage('Device ID is required'),
      body('reason').optional().isString(),
    ],
    validate,
    lockDevice
  );

  router.post(
    '/wipe',
    authMiddleware,
    adminMiddleware,
    withIO,
    [
      body('deviceId').notEmpty().withMessage('Device ID is required'),
      body('reason').optional().isString(),
    ],
    validate,
    wipeDevice
  );

  return router;
};