import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISubArea {
  _id?: Types.ObjectId | string;
  name: string; // e.g. "Cyber City Hub", "DLF Phase 3", "Patia Center"
  center: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  isActive: boolean;
  createdAt?: Date;
}

export interface IDeliveryZone extends Document {
  name: string; // e.g. "Haryana", "Gurgaon", "Bhubaneswar"
  center: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  isActive: boolean;
  state?: string;
  city?: string;
  subAreas?: ISubArea[];
  createdAt: Date;
  updatedAt: Date;
}

const SubAreaSchema = new Schema<ISubArea>(
  {
    name: {
      type: String,
      required: [true, "Sub-area / Zone name is required"],
      trim: true,
    },
    center: {
      lat: {
        type: Number,
        required: [true, "Latitude is required"],
      },
      lng: {
        type: Number,
        required: [true, "Longitude is required"],
      },
    },
    radiusKm: {
      type: Number,
      required: [true, "Radius is required"],
      min: [0.5, "Minimum radius is 0.5 km"],
      max: [100, "Maximum radius is 100 km"],
      default: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const DeliveryZoneSchema = new Schema<IDeliveryZone>(
  {
    name: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    city: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    center: {
      lat: { type: Number, required: true, default: 28.4595 },
      lng: { type: Number, required: true, default: 77.0266 },
    },
    radiusKm: {
      type: Number,
      required: true,
      default: 15,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    subAreas: {
      type: [SubAreaSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

DeliveryZoneSchema.index({ name: 1, isActive: 1 });

const DeliveryZone =
  (mongoose.models.DeliveryZone as mongoose.Model<IDeliveryZone>) ||
  mongoose.model<IDeliveryZone>("DeliveryZone", DeliveryZoneSchema);

export default DeliveryZone;
