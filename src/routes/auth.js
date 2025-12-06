// src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// In-memory user storage (replace with database later)
const users = [];

// Simple validation function
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Registration request body:', req.body);
    
    const { rollNo, username, email, password } = req.body;
    
    // Validation
    if (!rollNo || !username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required: rollNo, username, email, password' 
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
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }
    
    // Check if roll number exists
    if (users.find(u => u.rollNo === rollNo)) {
      return res.status(400).json({ 
        success: false,
        message: 'Roll number already registered' 
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: Date.now().toString(),
      rollNo,
      username,
      email,
      password: hashedPassword,
      role: 'student',
      createdAt: new Date().toISOString()
    };
    
    users.push(user);
    console.log('✅ User registered:', user.id);
    
    // Generate token
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        rollNo: user.rollNo,
        username: user.username 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        rollNo: user.rollNo,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
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
    const user = users.find(u => u.rollNo === rollNo || u.email === rollNo);
    
    if (!user) {
      console.log('❌ User not found for rollNo/email:', rollNo);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Password mismatch for user:', user.id);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log('✅ Login successful for user:', user.id);
    
    // Generate token
    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        rollNo: user.rollNo,
        username: user.username 
      },
      process.env.JWT_SECRET || 'secureguard-secret-key-2024-change-this',
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        rollNo: user.rollNo,
        username: user.username,
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

// Test endpoint to see all users
router.get('/users', (req, res) => {
  res.json({
    success: true,
    count: users.length,
    users: users.map(u => ({
      id: u.id,
      rollNo: u.rollNo,
      username: u.username,
      email: u.email,
      role: u.role
    }))
  });
});

module.exports = router;