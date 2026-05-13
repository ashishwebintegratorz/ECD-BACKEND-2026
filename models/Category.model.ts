import { Schema, model, Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  slug: string;
  parent?: string | null;
  ordering?: number;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, index: true },
    slug: { type: String, required: true, index: true, unique: true },
    parent: { type: String, default: null },
    ordering: { type: Number, default: 0 },
    image: { type: String },
  },
  { timestamps: true }
);

export default model<ICategory>("Category", CategorySchema);
