import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../models/Product.js';

dotenv.config();

export const freshBeverageProducts = [
  {
    sku: 'FR-01',
    name: 'Fresh Cola 250 ml',
    banglaName: 'ফ্রেশ কোলা ২৫০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 16.5,
    tradePrice: 18.0,
    mrp: 20,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-02',
    name: 'Fresh Cola 500 ml',
    banglaName: 'ফ্রেশ কোলা ৫০০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 29.0,
    tradePrice: 32.0,
    mrp: 35,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-03',
    name: 'Fresh Cola 1000 ml',
    banglaName: 'ফ্রেশ কোলা ১ লিটার (১০০০ মি.লি.)',
    category: 'Carbonated Beverages',
    cartonSize: 12,
    dealerPrice: 58.0,
    tradePrice: 64.0,
    mrp: 70,
    currentStockPcs: 120,
    minStockAlert: 24,
  },
  {
    sku: 'FR-04',
    name: 'Fresh Up 250 ml',
    banglaName: 'ফ্রেশ আপ ২৫০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 16.5,
    tradePrice: 18.0,
    mrp: 20,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-05',
    name: 'Fresh Up 500 ml',
    banglaName: 'ফ্রেশ আপ ৫০০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 29.0,
    tradePrice: 32.0,
    mrp: 35,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-06',
    name: 'Fresh Up 1000 ml',
    banglaName: 'ফ্রেশ আপ ১ লিটার (১০০০ মি.লি.)',
    category: 'Carbonated Beverages',
    cartonSize: 12,
    dealerPrice: 58.0,
    tradePrice: 64.0,
    mrp: 70,
    currentStockPcs: 120,
    minStockAlert: 24,
  },
  {
    sku: 'FR-07',
    name: 'Googly 250 ml',
    banglaName: 'গুগলি ২৫০ মি.লি. (কমলা)',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 16.5,
    tradePrice: 18.0,
    mrp: 20,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-08',
    name: 'Googly 500 ml',
    banglaName: 'গুগলি ৫০০ মি.লি. (কমলা)',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 29.0,
    tradePrice: 32.0,
    mrp: 35,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-09',
    name: 'Googly 1000 ml',
    banglaName: 'গুগলি ১ লিটার (১০০০ মি.লি.)',
    category: 'Carbonated Beverages',
    cartonSize: 12,
    dealerPrice: 58.0,
    tradePrice: 64.0,
    mrp: 70,
    currentStockPcs: 120,
    minStockAlert: 24,
  },
  {
    sku: 'FR-10',
    name: 'Fresh Mojito',
    banglaName: 'ফ্রেশ মোহিতো ২৫০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 21.0,
    tradePrice: 23.0,
    mrp: 25,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-11',
    name: 'Gear',
    banglaName: 'গিয়ার এনার্জি ড্রিংক ২৫০ মি.লি.',
    category: 'Energy Drinks',
    cartonSize: 24,
    dealerPrice: 29.0,
    tradePrice: 32.0,
    mrp: 35,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-12',
    name: 'Magenda',
    banglaName: 'ম্যাজেন্ডা ২৫০ মি.লি.',
    category: 'Carbonated Beverages',
    cartonSize: 24,
    dealerPrice: 21.0,
    tradePrice: 23.0,
    mrp: 25,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-13',
    name: 'Water 250 ml',
    banglaName: 'ফ্রেশ খাবার পানি ২৫০ মি.লি.',
    category: 'Drinking Water',
    cartonSize: 24,
    dealerPrice: 8.5,
    tradePrice: 9.5,
    mrp: 10,
    currentStockPcs: 480,
    minStockAlert: 96,
  },
  {
    sku: 'FR-14',
    name: 'Water 330 ml',
    banglaName: 'ফ্রেশ খাবার পানি ৩৩০ মি.লি.',
    category: 'Drinking Water',
    cartonSize: 24,
    dealerPrice: 12.0,
    tradePrice: 13.5,
    mrp: 15,
    currentStockPcs: 480,
    minStockAlert: 96,
  },
  {
    sku: 'FR-15',
    name: 'Water 500 ml',
    banglaName: 'ফ্রেশ খাবার পানি ৫০০ মি.লি.',
    category: 'Drinking Water',
    cartonSize: 24,
    dealerPrice: 16.0,
    tradePrice: 18.0,
    mrp: 20,
    currentStockPcs: 480,
    minStockAlert: 96,
  },
  {
    sku: 'FR-16',
    name: 'Water 1 Ltr',
    banglaName: 'ফ্রেশ খাবার পানি ১ লিটার',
    category: 'Drinking Water',
    cartonSize: 12,
    dealerPrice: 24.0,
    tradePrice: 27.0,
    mrp: 30,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-17',
    name: 'Water 1.5 Ltr',
    banglaName: 'ফ্রেশ খাবার পানি ১.৫ লিটার',
    category: 'Drinking Water',
    cartonSize: 12,
    dealerPrice: 28.0,
    tradePrice: 32.0,
    mrp: 35,
    currentStockPcs: 240,
    minStockAlert: 48,
  },
  {
    sku: 'FR-18',
    name: 'Water 2 Ltr',
    banglaName: 'ফ্রেশ খাবার পানি ২ লিটার',
    category: 'Drinking Water',
    cartonSize: 6,
    dealerPrice: 36.0,
    tradePrice: 41.0,
    mrp: 45,
    currentStockPcs: 120,
    minStockAlert: 24,
  },
  {
    sku: 'FR-19',
    name: 'Water 5 Ltr',
    banglaName: 'ফ্রেশ খাবার পানি ৫ লিটার জার',
    category: 'Drinking Water',
    cartonSize: 2,
    dealerPrice: 68.0,
    tradePrice: 76.0,
    mrp: 85,
    currentStockPcs: 40,
    minStockAlert: 10,
  },
  {
    sku: 'FR-20',
    name: 'Water 8 Ltr',
    banglaName: 'ফ্রেশ খাবার পানি ৮ লিটার জার',
    category: 'Drinking Water',
    cartonSize: 2,
    dealerPrice: 105.0,
    tradePrice: 118.0,
    mrp: 130,
    currentStockPcs: 40,
    minStockAlert: 10,
  },
];

export async function syncTanvirTradersCatalog() {
  console.log(`[Seed] Syncing exact 20 Meghna Beverage Ltd (Fresh) products for Tanvir Traders...`);
  await Product.deleteMany({});

  for (const item of freshBeverageProducts) {
    await Product.create({
      ...item,
      priceHistory: [
        {
          tradePrice: item.tradePrice,
          dealerPrice: item.dealerPrice,
          effectiveFrom: new Date(),
          note: 'Tanvir Traders Official Meghna Beverage Ltd - Fresh Dealership Setup',
        },
      ],
    });
  }

  console.log(`[Seed Complete] 100% synced all 20 Meghna Beverage Ltd (Fresh) products for Tanvir Traders!`);
}

async function runSeed() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tanvir_traders_fresh';
  try {
    await mongoose.connect(mongoURI);
    await syncTanvirTradersCatalog();
    process.exit(0);
  } catch (error) {
    console.error('[Seed Error]:', error);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('seed.ts')) {
  runSeed();
}
