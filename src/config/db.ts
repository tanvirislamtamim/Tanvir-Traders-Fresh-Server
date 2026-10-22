import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { syncTanvirTradersCatalog } from '../scripts/seed.js';

let isConnecting = false;
let hasSeeded = false;

export const connectDB = async (): Promise<typeof mongoose | void> => {
  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // If currently in the process of connecting, wait for it
  if (isConnecting) {
    let attempts = 0;
    while ((mongoose.connection.readyState as number) === 2 && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      attempts++;
    }
    if ((mongoose.connection.readyState as number) === 1) {
      return mongoose;
    }
  }

  isConnecting = true;
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tanvir_traders_fresh';

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 30000, // 30 seconds for cloud clusters
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host} (${conn.connection.name})`);
    isConnecting = false;

    if (!hasSeeded) {
      hasSeeded = true;
      await autoSeedIfNecessary();
    }
    return conn;
  } catch (error: any) {
    isConnecting = false;
    console.warn(`[Database] Primary MongoDB at ${mongoURI.split('@').pop() || mongoURI} connection failed (${error.message}).`);

    // Only attempt in-memory fallback in local development if not in production/Vercel
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log(`[Database] Attempting in-memory MongoDB fallback for local development...`);
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        const conn = await mongoose.connect(uri);
        console.log(`[Database] In-Memory MongoDB Connected at: ${uri}`);
        if (!hasSeeded) {
          hasSeeded = true;
          await autoSeedIfNecessary();
        }
        return conn;
      } catch (memErr: any) {
        console.error('[Database] In-memory MongoDB fallback failed:', memErr.message);
      }
    }

    throw error;
  }
};

async function autoSeedIfNecessary() {
  try {
    const firstProduct = await Product.findOne();
    // If empty or has old sku format like AK- or FAN- instead of FR-
    if (!firstProduct || !firstProduct.sku.startsWith('FR-')) {
      console.log(`[Catalog] Synchronizing Tanvir Traders' exact Meghna Beverage Ltd (Fresh) items...`);
      await syncTanvirTradersCatalog();
    } else {
      const count = await Product.countDocuments();
      console.log(`[Catalog] Found ${count} products in database ready for Tanvir Traders.`);
    }
  } catch (err) {
    console.error('[Seed Check Error]:', err);
  }
}
