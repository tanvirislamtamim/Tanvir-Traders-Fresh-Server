import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'developer' | 'dealer' | 'admin' | 'user';

export interface IAppUser extends Document {
  uid: string;         // Firebase UID
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const AppUserSchema = new Schema<IAppUser>(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, default: '' },
    role: {
      type: String,
      enum: ['developer', 'dealer', 'admin', 'user'],
      default: 'user',
    },
  },
  { timestamps: true }
);

export const AppUser = mongoose.model<IAppUser>('AppUser', AppUserSchema);
