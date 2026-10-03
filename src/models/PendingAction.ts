import mongoose, { Document, Schema } from 'mongoose';

export type PendingActionType = 'CREATE' | 'UPDATE' | 'DELETE';
export type PendingEntityType = 'daily_sale' | 'stock_inward' | 'product';
export type PendingStatus = 'pending' | 'approved' | 'rejected';

export interface IComparisonItem {
  productId?: string;
  name: string;
  banglaName?: string;
  sku: string;
  cartonSize?: number;
  changeType: 'added' | 'modified' | 'removed' | 'unchanged';
  before: {
    cartons?: number;
    pcs?: number;
    totalPcs?: number;
    tradePrice?: number;
    dealerPrice?: number;
    totalAmount?: number;
    currentStockPcs?: number;
  };
  after: {
    cartons?: number;
    pcs?: number;
    totalPcs?: number;
    tradePrice?: number;
    dealerPrice?: number;
    totalAmount?: number;
    currentStockPcs?: number;
  };
  diffDescription?: string;
}

export interface IPendingAction extends Document {
  actionType: PendingActionType;
  entityType: PendingEntityType;
  entityId?: string;
  title: string;
  summary: string;
  status: PendingStatus;

  submittedBy: {
    uid: string;
    email: string;
    displayName: string;
    role: string;
  };

  reviewedBy?: {
    uid: string;
    email: string;
    displayName: string;
    role: string;
  };
  reviewNotes?: string;
  reviewedAt?: Date;

  oldData?: any;
  newData?: any;

  // Visual diff summary
  summaryMetrics?: {
    beforeTotalAmount?: number;
    afterTotalAmount?: number;
    amountDiff?: number;
    beforeTotalCartons?: number;
    afterTotalCartons?: number;
    cartonsDiff?: number;
    beforeTotalPcs?: number;
    afterTotalPcs?: number;
    pcsDiff?: number;
    changedItemsCount?: number;
  };

  comparison?: IComparisonItem[];

  createdAt: Date;
  updatedAt: Date;
}

const ComparisonItemSchema = new Schema(
  {
    productId: { type: String },
    name: { type: String, required: true },
    banglaName: { type: String },
    sku: { type: String, required: true },
    cartonSize: { type: Number },
    changeType: {
      type: String,
      enum: ['added', 'modified', 'removed', 'unchanged'],
      default: 'modified',
    },
    before: { type: Schema.Types.Mixed, default: {} },
    after: { type: Schema.Types.Mixed, default: {} },
    diffDescription: { type: String },
  },
  { _id: false }
);

const PendingActionSchema = new Schema<IPendingAction>(
  {
    actionType: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['daily_sale', 'stock_inward', 'product'],
      required: true,
      index: true,
    },
    entityId: { type: String },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    submittedBy: {
      uid: { type: String, required: true },
      email: { type: String, required: true },
      displayName: { type: String, default: '' },
      role: { type: String, required: true },
    },
    reviewedBy: {
      uid: { type: String },
      email: { type: String },
      displayName: { type: String },
      role: { type: String },
    },
    reviewNotes: { type: String, default: '' },
    reviewedAt: { type: Date },

    oldData: { type: Schema.Types.Mixed },
    newData: { type: Schema.Types.Mixed },

    summaryMetrics: { type: Schema.Types.Mixed },
    comparison: [ComparisonItemSchema],
  },
  { timestamps: true }
);

export const PendingAction = mongoose.model<IPendingAction>('PendingAction', PendingActionSchema);
