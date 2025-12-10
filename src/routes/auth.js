const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

// No need for ioInstance in auth routes since they don't use Socket.IO

// Validation function
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request body:', req.body);
    
    const { rollNo, name, email, password } = req.body; 
    
    // Validation
    if (!rollNo || !name || !email || !password) { 
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required: rollNo, name, email, password' 
      });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide a valid email address' 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }
    
    // Check if user exists in MongoDB
    const existingUser = await User.findOne({
      $or: [{ email }, { rollNo: rollNo.toUpperCase() }]
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ 
          success: false,
          message: 'User already exists with this email' 
        });
      }
      if (existingUser.rollNo === rollNo.toUpperCase()) {
        return res.status(400).json({ 
          success: false,
          message: 'Roll number already registered' 
        });
      }
    }
    
    // Create new user
    const user = new User({
      rollNo: rollNo.toUpperCase(),
      name, 
      email: email.toLowerCase(),
      password, 
      role: 'student'
    });
    
    await user.save();
    console.log('✅ User registered in MongoDB:', user._id);
    
    // Generate token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        rollNo: user.rollNo,
        name: user.name 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        rollNo: user.rollNo,
        name: user.name, 
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false,
        message: messages.join(', ') 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false,
        message: `${field} already exists` 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    console.log('🔑 Login request body:', req.body);
    
    const { rollNo, password } = req.body;
    
    // Validation
    if (!rollNo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Roll number and password are required'
      });
    }
    
    // Find user by roll number or email
    const user = await User.findOne({
      $or: [
        { rollNo: rollNo.toUpperCase() },
        { email: rollNo.toLowerCase() }
      ],
      isActive: true
    });
    
    if (!user) {
      console.log('❌ User not found for rollNo/email:', rollNo);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Password mismatch for user:', user._id);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log('✅ Login successful for user:', user._id);
    
    // Generate token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        rollNo: user.rollNo,
        name: user.name 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        rollNo: user.rollNo,
        name: user.name, 
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get current user (protected route)
const { auth } = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Change password (protected route)
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    const user = await User.findById(req.user.id);
    
    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get all users (protected route - admin only)
const { isAdmin } = require('../middleware/auth');
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password'); 
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Test endpoint to check database connection
router.get('/test-db', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      success: true,
      message: 'Database connected successfully',
      userCount,
      mongoDB: 'Connected'
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      mongoDB: 'Disconnected'
    });
  }
});

// Export the router directly
module.exports = router;