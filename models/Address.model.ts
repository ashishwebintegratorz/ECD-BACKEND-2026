// models/Address.ts
import { Schema, model, Document, Types } from "mongoose";

export interface IAddress extends Document {
  user: Types.ObjectId;
  label?: string; 
  fullAddress: string; 
  apartment?: string;
  landmark?: string;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  phone?: string;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String },
    fullAddress: { type: String, required: true },   // manual address string
    apartment: { type: String },
    landmark: { type: String },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { 
        type: [Number], 
        required: true,
        validate: {
          validator: v => v.length === 2,
          message: "Coordinates must be [lng, lat]"
        }
      },  
    },
    phone: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AddressSchema.index({ location: "2dsphere" }); // enables geolocation search
AddressSchema.index({ user: 1, isDefault: 1 });

export default model<IAddress>("Address", AddressSchema);
