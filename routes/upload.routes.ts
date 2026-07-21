import { Router } from "express";
import { upload } from "../middlewares/multer.js";
import { uploadImage } from "../controllers/upload.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";

const router = Router();

// Upload image (accessible to any authenticated user with size limit & type validation)
router.post("/", jwtAuth, upload.single("image"), asyncHandler(uploadImage));

export default router;
