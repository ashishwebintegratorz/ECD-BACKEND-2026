import { Schema, model, Document, Types } from "mongoose";

export type UserRole = "customer" | "driver" | "admin";

export interface IUser extends Document {
  phone: string;
  name?: string;
  role: UserRole;
  isVerified: boolean;
  pinHash?: string;
  avatar?: string;
  email?: string;
  addresses?: Types.ObjectId[];
  isOnline: boolean;
  isReturning: boolean;
  deliveryOtp?: string; // fixed OTP used to confirm delivery
  createdAt: Date;
  updatedAt: Date;
  meta?: Record<string, any>;
}

const UserSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    role: { type: String, enum: ["customer", "driver", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false },
    pinHash: { type: String },
    avatar: { type: String },
    email: { type: String, index: true, sparse: true },
    addresses: [{ type: Schema.Types.ObjectId, ref: "Address" }],
    isOnline: { type: Boolean, default: false, index: true },
    isReturning: { type: Boolean, default: false, index: true },
    deliveryOtp: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default model<IUser>("User", UserSchema);
