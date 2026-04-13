import { Schema, model, Document, Types } from "mongoose";

export interface INotification extends Document {
  user?: Types.ObjectId;
  title: string;
  body: string;
  type?: string;
  data?: Record<string, any>; // payload for client
  read?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default model<INotification>("Notification", NotificationSchema);
