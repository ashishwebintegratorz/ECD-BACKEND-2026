import { Request, Response } from "express";
import { BannerModel } from "../models/Banner.model.js";
import { HTTPSTATUS } from "../config/http.config.js";

export const getAllBanners = async (req: Request, res: Response) => {
  const banners = await BannerModel.find().sort({ createdAt: -1 });
  return res.status(HTTPSTATUS.OK).json({ success: true, banners });
};

export const getActiveBanners = async (req: Request, res: Response) => {
  const banners = await BannerModel.find({ isActive: true }).sort({ createdAt: -1 });
  return res.status(HTTPSTATUS.OK).json({ success: true, banners });
};

export const addBanner = async (req: Request, res: Response) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res
      .status(HTTPSTATUS.BAD_REQUEST)
      .json({ message: "Image URL is required" });
  }

  const banner = await BannerModel.create({ imageUrl });

  return res.status(HTTPSTATUS.CREATED).json({
    success: true,
    message: "Banner created successfully",
    banner,
  });
};

export const deleteBanner = async (req: Request, res: Response) => {
  const { id } = req.params;

  const banner = await BannerModel.findByIdAndDelete(id);

  if (!banner) {
    return res
      .status(HTTPSTATUS.NOT_FOUND)
      .json({ message: "Banner not found" });
  }

  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: "Banner deleted successfully",
  });
};

export const toggleBannerStatus = async (req: Request, res: Response) => {
  const { id } = req.params;

  const banner = await BannerModel.findById(id);

  if (!banner) {
    return res
      .status(HTTPSTATUS.NOT_FOUND)
      .json({ message: "Banner not found" });
  }

  banner.isActive = !banner.isActive;
  await banner.save();

  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: `Banner is now ${banner.isActive ? "active" : "inactive"}`,
    banner,
  });
};
