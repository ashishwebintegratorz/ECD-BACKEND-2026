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
    const { name } = req.body;
    user.name = name || user.name;
    await user.save();
    return res.json({ user });
  }
);
