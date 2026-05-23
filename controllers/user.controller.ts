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
    const user = (req as any).user;
    const { name, avatar } = req.body;
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
    await user.save();
    return res.json({ user });
  }
);
