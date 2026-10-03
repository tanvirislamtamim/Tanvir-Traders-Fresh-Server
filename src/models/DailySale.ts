import mongoose, { Document, Schema } from 'mongoose';

export interface IDailySaleItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  productSku: string;
  category?: string;
  cartonSize: number;
  quantityCartons: number; // Number of cartons sold
  quantityPcs: number; // Loose pieces sold
  totalPcsSold: number; // Total pieces = (quantityCartons * cartonSize) + quantityPcs
  unitTradePrice: number; // Price per piece at time of sale (SNAPSHOT - NEVER CHANGES)
  unitDealerPrice: number; // Cost per piece at time of sale (SNAPSHOT)
  totalAmount: number; // totalPcsSold * unitTradePrice
  totalCost: number; // totalPcsSold * unitDealerPrice
  grossProfit: number; // totalAmount - totalCost
}

export interface IDailySale extends Document {
  date: string; // Format YYYY-MM-DD
  memoNo: string;
  notes?: string;
  items: IDailySaleItem[];
  totalAmount: number; // Total Daily Sale in BDT (Taka)
  totalCost: number; // Total Cost of goods sold in BDT
  totalProfit: number; // Daily gross profit in BDT
  totalCartonsSold: number;
  totalPcsSold: number;
  stockDeducted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DailySaleItemSchema = new Schema<IDailySaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    productSku: { type: String, required: true },
    category: { type: String },
    cartonSize: { type: Number, required: true, default: 24 },
    quantityCartons: { type: Number, default: 0, min: 0 },
    quantityPcs: { type: Number, default: 0, min: 0 },
    totalPcsSold: { type: Number, required: true, min: 0 },
    unitTradePrice: { type: Number, required: true, min: 0 },
    unitDealerPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    grossProfit: { type: Number, required: true },
  },
  { _id: false }
);

const DailySaleSchema = new Schema<IDailySale>(
  {
    date: { type: String, required: true, index: true },
    memoNo: { type: String, required: true, unique: true, index: true },
    notes: { type: String, default: '' },
    items: [DailySaleItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    totalProfit: { type: Number, required: true },
    totalCartonsSold: { type: Number, required: true, default: 0 },
    totalPcsSold: { type: Number, required: true, default: 0 },
    stockDeducted: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export const DailySale = mongoose.model<IDailySale>('DailySale', DailySaleSchema);
