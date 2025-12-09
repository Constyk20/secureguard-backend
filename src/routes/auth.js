const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import the User model

// Validation function
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request body:', req.body);
    
    const { rollNo, name, email, password } = req.body; // Changed username to name
    
    // Validation
    if (!rollNo || !name || !email || !password) { // Changed username to name
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required: rollNo, name, email, password' // Updated message
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
    
    // Create new user - using name field instead of username
    const user = new User({
      rollNo: rollNo.toUpperCase(),
      name, // Changed from username to name
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save middleware
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
        name: user.name // Changed from username to name
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
        name: user.name, // Changed from username to name
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
    
    // Find user by roll number or email in MongoDB
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
    
    // Check password using the model method
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
        name: user.name // Changed from username to name
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
        name: user.name, // Changed from username to name
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

// Get all users (protected route example)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password'); // Exclude password field
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

module.exports = router;