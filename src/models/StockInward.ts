import mongoose, { Document, Schema } from 'mongoose';

export interface IStockInwardItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  productSku: string;
  cartonSize: number;
  quantityCartons: number;
  quantityPcs: number;
  totalPcsReceived: number; // (quantityCartons * cartonSize) + quantityPcs
  unitDealerPrice: number; // Purchase price per piece from Meghna Beverage Ltd
  totalCost: number; // totalPcsReceived * unitDealerPrice
}

export interface IStockInward extends Document {
  challanNo: string; // Meghna Beverage Challan or Inward Invoice number
  date: string; // Format YYYY-MM-DD
  supplier: string; // e.g. "Meghna Beverage Ltd"
  vehicleNo?: string;
  receivedBy?: string;
  notes?: string;
  items: IStockInwardItem[];
  totalAmount: number; // Total inward purchase value in BDT
  totalCartons: number;
  totalPcs: number;
  stockAdded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StockInwardItemSchema = new Schema<IStockInwardItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    productSku: { type: String, required: true },
    cartonSize: { type: Number, required: true, default: 24 },
    quantityCartons: { type: Number, default: 0, min: 0 },
    quantityPcs: { type: Number, default: 0, min: 0 },
    totalPcsReceived: { type: Number, required: true, min: 0 },
    unitDealerPrice: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const StockInwardSchema = new Schema<IStockInward>(
  {
    challanNo: { type: String, required: true, unique: true, index: true },
    date: { type: String, required: true, index: true },
    supplier: { type: String, default: 'Meghna Beverage Ltd' },
    vehicleNo: { type: String, default: '' },
    receivedBy: { type: String, default: 'Store In-charge' },
    notes: { type: String, default: '' },
    items: [StockInwardItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    totalCartons: { type: Number, required: true, default: 0 },
    totalPcs: { type: Number, required: true, default: 0 },
    stockAdded: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export const StockInward = mongoose.model<IStockInward>('StockInward', StockInwardSchema);
