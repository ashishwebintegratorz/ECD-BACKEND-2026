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
  riderId?: string;     // unique identifier for driver (e.g. DRV_001)
  totalWorkSeconds?: number;
  walletBalance?: number;
  dailyOnlineSeconds?: number;
  lastShiftReset?: Date;
  status: "pending" | "active" | "suspended";
  documents?: {
    aadharFront?: string;
    aadharBack?: string;
    panCard?: string;
    license?: string;
    vehicleRc?: string;
    bankPassbook?: string;
  };
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
    riderId: { type: String, unique: true, sparse: true },
    totalWorkSeconds: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    dailyOnlineSeconds: { type: Number, default: 0 },
    lastShiftReset: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "active", "suspended"], default: "active" },
    documents: {
      aadharFront: String,
      aadharBack: String,
      panCard: String,
      license: String,
      vehicleRc: String,
      bankPassbook: String,
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default model<IUser>("User", UserSchema);
