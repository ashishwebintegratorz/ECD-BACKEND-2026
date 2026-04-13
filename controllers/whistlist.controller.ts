import { Request, Response } from "express";
import mongoose from "mongoose";
import Wishlist from "../models/Whishlist.model.js";
import Product from "../models/Product.model.js";

/* ================================
   ADD TO WISHLIST
================================ */
export const addToWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    // 1️⃣ Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // 2️⃣ Check product existence (handles missing isActive)
    const product = await Product.findById(productId).select("_id isActive");

    if (!product || product.isActive === false) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // 3️⃣ Add product to wishlist
    const wishlist = await Wishlist.findOneAndUpdate(
      { userId },
      { $addToSet: { products: productId } },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Product added to wishlist",
      data: wishlist,
    });
  } catch (error) {
    console.error("Add to wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ================================
   REMOVE FROM WISHLIST
================================ */
export const removeFromWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const wishlist = await Wishlist.findOneAndUpdate(
      { userId },
      { $pull: { products: productId } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Product removed from wishlist",
      data: wishlist,
    });
  } catch (error) {
    console.error("Remove from wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ================================
   GET USER WISHLIST
================================ */
export const getWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: "products",
        match: { isActive: { $ne: false } }, // hides inactive products
      });

    return res.status(200).json({
      success: true,
      data: wishlist || { products: [] },
    });
  } catch (error) {
    console.error("Get wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ================================
   CLEAR WISHLIST
================================ */
export const clearWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    await Wishlist.findOneAndUpdate(
      { userId },
      { $set: { products: [] } }
    );

    return res.status(200).json({
      success: true,
      message: "Wishlist cleared",
    });
  } catch (error) {
    console.error("Clear wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
