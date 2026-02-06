import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Admin credentials
    const adminEmail = '27523270@students.lincoln.ac.uk';
    const adminPassword = 'Bukunmi100!';
    const adminUsername = 'developer_admin';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('Admin user already exists');
      
      // Update existing admin to have developer rank and max XP
      existingAdmin.rank = 'developer';
      existingAdmin.role = 'admin';
      existingAdmin.xp = 1000; // Max XP
      existingAdmin.passes = 5; // Default passes
      await existingAdmin.save();
      console.log('Updated existing admin to developer rank with max XP and passes');
    } else {
      // Create new admin user
      const adminUser = new User({
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        rank: 'developer',
        xp: 1000, // Max XP
        passes: 5, // Default passes
        isVerified: true
      });

      await adminUser.save();
      console.log('Admin user created successfully');
      console.log('Email:', adminEmail);
      console.log('Password:', adminPassword);
      console.log('XP: 1000 (Maxed Out)');
      console.log('Passes: 5');
    }

    mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();
