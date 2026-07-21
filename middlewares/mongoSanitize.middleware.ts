import type { Request, Response, NextFunction } from "express";

/**
 * Recursively removes keys starting with '$' or containing '.' from objects.
 * Prevents NoSQL operator injection (e.g. { "$gt": "" }, { "$ne": null }) in req.body, req.query, and req.params.
 */
function sanitizeInPlace(obj: any): void {
  if (obj === null || typeof obj !== "object") {
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "object" && obj[i] !== null) {
        sanitizeInPlace(obj[i]);
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeInPlace(obj[key]);
    }
  }
}

export const mongoSanitize = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    sanitizeInPlace(req.body);
  }
  if (req.query) {
    sanitizeInPlace(req.query);
  }
  if (req.params) {
    sanitizeInPlace(req.params);
  }
  next();
};
