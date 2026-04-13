import { Schema, model, Document, Types } from "mongoose";

export interface IRefreshToken extends Document {
  user: Types.ObjectId;
  deviceId?: string;
  tokenHash: string; // hashed refresh token
  ip?: string;
  userAgent?: string;
  revoked?: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String },
    tokenHash: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
    revoked: { type: Boolean, default: false },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

RefreshTokenSchema.index({ user: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // optional if you want automatic cleanup

export default model<IRefreshToken>("RefreshToken", RefreshTokenSchema);
