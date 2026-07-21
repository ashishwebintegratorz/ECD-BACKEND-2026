import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http.config.js";
import { AppError } from "../utils/appError.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  console.error("Error on path", req.path, err);

  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return res
      .status(HTTPSTATUS.BAD_REQUEST)
      .json({ message: "Validation failed", errors });
  }

  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ message: err.message, errorCode: err.errorCode });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const errorMessage = isProduction
    ? "An unexpected internal server error occurred"
    : `Internal Server Error: ${(err as any)?.message || String(err)}`;

  return res
    .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
    .json({
      message: errorMessage,
      ...(isProduction ? {} : { error: (err as any)?.message }),
    });
};
