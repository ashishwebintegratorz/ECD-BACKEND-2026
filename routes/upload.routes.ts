import { Router } from "express";
import multer from "multer";
import { uploadImage } from "../controllers/upload.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload image (accessible to any authenticated user)
router.post("/", jwtAuth, upload.single("image"), asyncHandler(uploadImage));

export default router;
