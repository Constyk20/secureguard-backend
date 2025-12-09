// src/middleware/adminAuth.js
const User = require('../models/User');

/**
 * Admin Authorization Middleware
 * Checks if the authenticated user has admin role
 * Must be used AFTER auth middleware
 */
const adminAuth = async (req, res, next) => {
  try {
    // Check if user is authenticated (set by auth middleware)
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Fetch user from database to check role
    const user = await User.findById(req.user.id).select('role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has admin role
    if (user.role !== 'admin') {
      console.log(`❌ Unauthorized admin access attempt by user: ${req.user.id}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    console.log(`✅ Admin access granted to user: ${req.user.id}`);
    
    // User is admin, proceed to next middleware/route
    next();
  } catch (error) {
    console.error('❌ Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
};

module.exports = adminAuth;