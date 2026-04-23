import { Schema, model, Document, Types } from "mongoose";

export type DevicePlatform = "android" | "ios" | "web";

export interface IDevice extends Document {
  user: Types.ObjectId;
  fcmToken: string;           // Firebase Cloud Messaging token
  platform: DevicePlatform;
  deviceId?: string;           // optional client-generated unique device ID
  deviceInfo?: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, enum: ["android", "ios", "web"], required: true },
    deviceId: { type: String },
    deviceInfo: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One token per user per device — upsert by fcmToken
DeviceSchema.index({ user: 1, fcmToken: 1 }, { unique: true });

export default model<IDevice>("Device", DeviceSchema);
