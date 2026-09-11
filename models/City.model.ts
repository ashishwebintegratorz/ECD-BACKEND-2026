import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICity extends Document {
  name: string;
  state?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema = new Schema<ICity>(
  {
    name: {
      type: String,
      required: [true, "City name is required"],
      unique: true,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    coordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

CitySchema.index({ name: 1, isActive: 1 });

const City =
  (mongoose.models.City as mongoose.Model<ICity>) ||
  mongoose.model<ICity>("City", CitySchema);

export default City;
