import type { Request, Response, NextFunction } from "express";
import { BadRequestException } from "../utils/appError.js";

export const requireJsonContent = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const contentLength = req.headers["content-length"];
    // If there is no body payload, we don't strictly require a content-type
    if (!contentLength || contentLength === "0") {
      return next();
    }

    const contentType = req.headers["content-type"];
    // Allow multipart/form-data for file uploads, but otherwise require JSON
    if (contentType && contentType.includes("multipart/form-data")) {
      return next();
    }
    
    if (!contentType || !contentType.includes("application/json")) {
      return next(new BadRequestException("Content-Type must be application/json"));
    }
  }
  next();
};
