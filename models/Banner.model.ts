import mongoose, { Document, Schema } from "mongoose";

export interface IBanner extends Document {
  imageUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    imageUrl: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const BannerModel = mongoose.model<IBanner>("Banner", bannerSchema);
export default BannerModel;
