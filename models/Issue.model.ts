import { Schema, model, Document, Types } from "mongoose";

export interface IIssue extends Document {
  user: Types.ObjectId;
  order: Types.ObjectId;
  description: string;
  status: "open" | "resolved";
  createdAt: Date;
  updatedAt: Date;
}

const IssueSchema = new Schema<IIssue>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
  },
  { timestamps: true }
);

export default model<IIssue>("Issue", IssueSchema);
