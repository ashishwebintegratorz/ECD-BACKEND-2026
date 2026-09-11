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
  cityId?: Types.ObjectId; // Ref to City
  name: string; // e.g. "Dewas Central", "Vijay Nagar", "Bhubaneswar North"
  center: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  polygonCoordinates?: [number, number][]; // Optional Polygon coordinates [[lng, lat], ...]
  isActive: boolean;
  state?: string;
  city?: string; // Legacy string city support
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
    cityId: {
      type: Schema.Types.ObjectId,
      ref: "City",
      index: true,
    },
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
    polygonCoordinates: {
      type: [[Number]],
      default: undefined,
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

DeliveryZoneSchema.index({ cityId: 1, isActive: 1 });
DeliveryZoneSchema.index({ name: 1, isActive: 1 });

const DeliveryZone =
  (mongoose.models.DeliveryZone as mongoose.Model<IDeliveryZone>) ||
  mongoose.model<IDeliveryZone>("DeliveryZone", DeliveryZoneSchema);

export default DeliveryZone;
