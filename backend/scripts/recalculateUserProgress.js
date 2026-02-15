import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { getRankForTotalUSD, getXpForTotalUSD, isStaffRank } from '../utils/rankUtils.js';

dotenv.config();

const recalculateUserProgress = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const users = await User.find().select('rank totalUSDValue xp');
    const bulkOps = [];

    for (const user of users) {
      if (isStaffRank(user.rank)) {
        continue;
      }

      const totalUSDValue = Number(user.totalUSDValue || 0);
      const nextRank = getRankForTotalUSD(totalUSDValue);
      const nextXp = getXpForTotalUSD(totalUSDValue);

      if (user.rank !== nextRank || user.xp !== nextXp) {
        bulkOps.push({
          updateOne: {
            filter: { _id: user._id },
            update: { $set: { rank: nextRank, xp: nextXp } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      const result = await User.bulkWrite(bulkOps);
      console.log(`Updated ${result.modifiedCount} user(s)`);
    } else {
      console.log('No users required updates');
    }

    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error recalculating user progress:', error);
    process.exit(1);
  }
};

recalculateUserProgress();
