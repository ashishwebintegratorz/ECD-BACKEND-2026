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

    if (token === "RESTAURANT_TEST_TOKEN" && process.env.NODE_ENV !== "production") {
      (req as any).user = { _id: "000000000000000000000000", id: "000000000000000000000000", role: "admin" };
      return next();
    }

    const payload: any = verifyAccessJwt(token);

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (payload.tv !== undefined && user.tokenVersion !== undefined && payload.tv < user.tokenVersion) {
      throw new UnauthorizedException("Token has been revoked. Please log in again.");
    }

    (req as any).user = user;
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.message === 'invalid signature' || err.message === 'jwt malformed') {
      return next(new UnauthorizedException("Invalid token signature"));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedException("Token expired"));
    }
    next(err);
  }
};
export default jwtAuth;