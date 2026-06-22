import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import UserModel from "../models/User.model.js";
import OrderModel from "../models/Order.model.js";

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ user });
});

export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { name, avatar, email, phone } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;

      const updatedUser = await UserModel.findByIdAndUpdate(
        user._id || user.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      return res.json({ user: updatedUser });
    } catch (error: any) {
      console.error("Update profile error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (!user._id && !user.id)) {
      return res.status(400).json({ success: false, message: "User ID missing" });
    }

    await UserModel.findByIdAndDelete(user._id || user.id);
    return res.json({ success: true, message: "Account deleted successfully" });
  } catch (error: any) {
    console.error("Delete account error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});
