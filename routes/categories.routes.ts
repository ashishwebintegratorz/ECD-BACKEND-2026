import { Router } from "express";
import {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categories.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";

const router = Router();

router.post("/", asyncHandler(addCategory));
router.get("/", asyncHandler(getAllCategories));
router.get("/:id", asyncHandler(getCategoryById));
router.put("/:id", asyncHandler(updateCategory));
router.delete("/:id", asyncHandler(deleteCategory));

export default router;
