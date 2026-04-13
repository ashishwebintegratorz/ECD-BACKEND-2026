import { Schema, model, Document, Types } from "mongoose";

export interface IDriverLocation extends Document {
  driver: Types.ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  speed?: number;
  heading?: number;
  updatedAt: Date;
  createdAt: Date;
}

const DriverLocationSchema = new Schema<IDriverLocation>(
  {
    driver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    speed: { type: Number },
    heading: { type: Number },
  },
  { timestamps: true }
);

DriverLocationSchema.index({ location: "2dsphere" });

export default model<IDriverLocation>("DriverLocation", DriverLocationSchema);
