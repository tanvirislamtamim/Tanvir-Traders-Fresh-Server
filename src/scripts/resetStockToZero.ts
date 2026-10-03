import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../models/Product.js';

dotenv.config();

const resetStock = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('[Reset Stock] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[Reset Stock] Connected successfully.');

    const result = await Product.updateMany({}, { $set: { currentStockPcs: 0 } });
    console.log(`[Reset Stock] Success! Set currentStockPcs = 0 for ${result.modifiedCount} products.`);

    await mongoose.disconnect();
    console.log('[Reset Stock] Disconnected from MongoDB.');
    process.exit(0);
  } catch (error) {
    console.error('[Reset Stock] Error:', error);
    process.exit(1);
  }
};

resetStock();
