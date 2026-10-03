import mongoose, { Document, Schema } from 'mongoose';

export interface IPriceHistory {
  tradePrice: number;
  dealerPrice: number;
  effectiveFrom: Date;
  note?: string;
}

export interface IProduct extends Document {
  sku: string;
  name: string;
  banglaName?: string;
  category: string;
  cartonSize: number; // Pieces per Carton (e.g. 24, 48, 72, 96)
  dealerPrice: number; // Cost Price per Piece (DP)
  tradePrice: number; // Selling Price per Piece (TP)
  mrp: number; // Maximum Retail Price per Piece
  currentStockPcs: number; // Current Inventory in total pieces
  minStockAlert: number; // Low stock threshold (in pieces)
  isActive: boolean;
  priceHistory: IPriceHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const PriceHistorySchema = new Schema<IPriceHistory>(
  {
    tradePrice: { type: Number, required: true },
    dealerPrice: { type: Number, required: true },
    effectiveFrom: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    banglaName: { type: String, trim: true },
    category: { type: String, required: true, default: 'General' },
    cartonSize: { type: Number, required: true, default: 24, min: 1 },
    dealerPrice: { type: Number, required: true, min: 0 },
    tradePrice: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    currentStockPcs: { type: Number, required: true, default: 0, min: [0, 'স্টক সংখ্যা ০ এর কম হতে পারে না'] },
    minStockAlert: { type: Number, default: 48 },
    isActive: { type: Boolean, default: true },
    priceHistory: [PriceHistorySchema],
  },
  {
    timestamps: true,
  }
);

// Virtual for carton stock
ProductSchema.virtual('currentStockCartons').get(function () {
  return (this.currentStockPcs / (this.cartonSize || 1)).toFixed(1);
});

export const Product = mongoose.model<IProduct>('Product', ProductSchema);
