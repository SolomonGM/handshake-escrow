import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const listUsers = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://jerome:NiOAmty3b8EEFmF0@handshake-dev.emc8dyz.mongodb.net/handshake_db';
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    
    console.log('=== USER ACCOUNTS IN DATABASE ===\n');
    console.log(`Total Users: ${users.length}\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   User ID: ${user.userId}`);
      console.log(`   Rank: ${user.rank}`);
      console.log(`   Password (hashed): ${user.password}`);
      console.log(`   Created: ${user.createdAt || 'N/A'}`);
      console.log('   ---');
    });

    console.log('\n⚠️  NOTE: Passwords are hashed with bcrypt and cannot be reversed.');
    console.log('💡 TIP: You can reset passwords or create new accounts if needed.\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

listUsers();
