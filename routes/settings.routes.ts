import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { getPublicSettings } from "../controllers/settings.controller.js";

const router = Router();

router.get("/", asyncHandler(getPublicSettings));

export default router;
