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
  googleId?: string;
  provider?: "phone" | "google";
  emailVerified?: boolean;
  addresses?: Types.ObjectId[];
  isOnline: boolean;
  isReturning: boolean;
  cityId?: Types.ObjectId; // Assigned City (for riders)
  zoneIds?: Types.ObjectId[]; // Assigned Delivery Zones (for riders)
  upi?: string;         // ✅ Driver UPI ID
  deliveryOtp?: string; // fixed OTP used to confirm delivery
  riderId?: string;     // unique identifier for driver (e.g. DRV_001)
  totalWorkSeconds?: number;
  walletBalance?: number;
  codBalance?: number;
  codEarnings?: number;
  dailyOnlineSeconds?: number;
  lastShiftReset?: Date;
  status: "pending" | "active" | "suspended";
  documents?: {
    aadharFront?: string;
    aadharBack?: string;
    license?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  tokenVersion?: number;
  failedLoginAttempts?: number;
  lockUntil?: Date;
  meta?: Record<string, any>;
}

const UserSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    role: { type: String, enum: ["customer", "driver", "admin"], default: "customer" },
    isVerified: { type: Boolean, default: false },
    pinHash: { type: String },
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    avatar: { type: String },
    email: { type: String, index: true, sparse: true },
    googleId: { type: String, unique: true, sparse: true },
    provider: { type: String, enum: ["phone", "google"], default: "phone" },
    emailVerified: { type: Boolean, default: false },
    addresses: [{ type: Schema.Types.ObjectId, ref: "Address" }],
    isOnline: { type: Boolean, default: false, index: true },
    isReturning: { type: Boolean, default: false, index: true },
    cityId: { type: Schema.Types.ObjectId, ref: "City", index: true },
    zoneIds: [{ type: Schema.Types.ObjectId, ref: "DeliveryZone", index: true }],
    upi: { type: String }, // Driver UPI ID
    deliveryOtp: { type: String },
    riderId: { type: String, unique: true, sparse: true },
    totalWorkSeconds: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    codBalance: { type: Number, default: 0 },
    codEarnings: { type: Number, default: 0 },
    dailyOnlineSeconds: { type: Number, default: 0 },
    lastShiftReset: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "active", "suspended"], default: "active" },
    documents: {
      aadharFront: String,
      aadharBack: String,
      license: String,
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, isOnline: 1, cityId: 1, zoneIds: 1 });

export default model<IUser>("User", UserSchema);
