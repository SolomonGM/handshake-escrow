import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const clearAllTickets = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://jerome:NiOAmty3b8EEFmF0@handshake-dev.emc8dyz.mongodb.net/handshake_db';
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Count before deletion
    const countBefore = await mongoose.connection.db.collection('tradetickets').countDocuments();
    console.log(`📊 Tickets before deletion: ${countBefore}`);

    // Delete all
    const result = await mongoose.connection.db.collection('tradetickets').deleteMany({});
    console.log(`🗑️  Delete operation result: ${result.deletedCount} documents deleted`);

    // Count after deletion
    const countAfter = await mongoose.connection.db.collection('tradetickets').countDocuments();
    console.log(`📊 Tickets after deletion: ${countAfter}`);

    if (countAfter === 0) {
      console.log('✅ All tickets successfully cleared!');
    } else {
      console.log('⚠️  Some tickets remain in the database');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

clearAllTickets();
