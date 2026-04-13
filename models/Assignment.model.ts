import { Schema, model, Document, Types } from "mongoose";

export interface IAssignment extends Document {
  driver: Types.ObjectId;
  orders: Types.ObjectId[]; // orders assigned to this route
  routePolyline?: string; // encoded polyline
  status: "pending" | "in_progress" | "completed" | "cancelled";
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    driver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orders: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    routePolyline: { type: String },
    status: { type: String, enum: ["pending", "in_progress", "completed", "cancelled"], default: "pending", index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export default model<IAssignment>("Assignment", AssignmentSchema);
