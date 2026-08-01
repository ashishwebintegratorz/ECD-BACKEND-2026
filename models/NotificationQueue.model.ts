import { Schema, model, Document, Types } from "mongoose";

export interface INotificationQueue extends Document {
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: string;
  data?: Record<string, string>;
  status: "pending" | "processing" | "success" | "failed";
  retryCount: number;
  nextRetryAt: Date;
  errorLog: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NotificationQueueSchema = new Schema<INotificationQueue>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["pending", "processing", "success", "failed"], default: "pending", index: true },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: Date.now, index: true },
    errorLog: [{ type: String }],
  },
  { timestamps: true }
);

// Compound index for fast queue polling
NotificationQueueSchema.index({ status: 1, nextRetryAt: 1 });

export default model<INotificationQueue>("NotificationQueue", NotificationQueueSchema);
