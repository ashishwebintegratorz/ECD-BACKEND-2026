import { Schema, model, Document } from "mongoose";

export interface IPopularDish extends Document {
  name: string;
  slug: string;
  image: string;
  category?: string;
  isActive: boolean;
  ordering: number;
}

const PopularDishSchema = new Schema<IPopularDish>(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    category: { type: String },
    isActive: { type: Boolean, default: true },
    ordering: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model<IPopularDish>("PopularDish", PopularDishSchema);
