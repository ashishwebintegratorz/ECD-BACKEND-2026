import type { Request, Response, NextFunction } from "express";
import { UnauthorizedException } from "../utils/appError.js";
import { verifyAccessJwt } from "../utils/jwt.js";
import UserModel from "../models/User.model.js";

export const jwtAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UnauthorizedException("Invalid authorization format");
    }

    const token = parts[1];
    const payload: any = verifyAccessJwt(token);

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
};
export default jwtAuth;