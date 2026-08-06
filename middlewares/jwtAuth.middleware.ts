import type { Request, Response, NextFunction } from "express";
import { UnauthorizedException } from "../utils/appError.js";
import { verifyAccessJwt } from "../utils/jwt.js";
import UserModel from "../models/User.model.js";
import Restaurant from "../models/Restaurant.model.js";

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

    if (token === "RESTAURANT_TEST_TOKEN") {
      if (process.env.NODE_ENV !== "development") {
        throw new UnauthorizedException("Test token not allowed in this environment");
      }
      (req as any).user = {
        _id: "69ef47bf77c29363016a95e5",
        id: "69ef47bf77c29363016a95e5",
        role: "admin",
      };
      return next();
    }

    const payload: any = verifyAccessJwt(token);

    if (payload.role === "restaurant") {
      const restaurant = await Restaurant.findById(payload.sub);
      if (!restaurant) {
        throw new UnauthorizedException("Restaurant not found");
      }
      (req as any).user = restaurant;
      // Provide role fallback for authorization checks
      if (!(req as any).user.role) {
        (req as any).user.role = "restaurant";
      }
      return next();
    }

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