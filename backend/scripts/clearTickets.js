import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const clearAllTickets = async () => {
  try {
    const mongoURI = String(process.env.MONGODB_URI || '').trim();
    if (!mongoURI) {
      throw new Error('MONGODB_URI is required');
    }
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // This counts before deletion.
    const countBefore = await mongoose.connection.db.collection('tradetickets').countDocuments();
    console.log(`📊 Tickets before deletion: ${countBefore}`);

    // This deletes all.
    const result = await mongoose.connection.db.collection('tradetickets').deleteMany({});
    console.log(`🗑️  Delete operation result: ${result.deletedCount} documents deleted`);

    // This counts after deletion.
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

