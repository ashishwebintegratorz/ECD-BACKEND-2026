import { Schema, model, Document, Types } from "mongoose";

export interface IDevice extends Document {
  user: Types.ObjectId;
  deviceId: string; // unique per device (client generated)
  deviceInfo?: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String, required: true },
    deviceInfo: { type: String },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

DeviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

export default model<IDevice>("Device", DeviceSchema);
