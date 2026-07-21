import express from "express";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../controllers/cart.controller.js";
import authMiddleware from "../middlewares/jwtAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { addToCartSchema, updateCartQuantitySchema } from "../validators/user.validator.js";

const router = express.Router();

router.get("/", authMiddleware, getCart);
router.post("/add", authMiddleware, validate(addToCartSchema), addToCart);
router.put("/update", authMiddleware, validate(updateCartQuantitySchema), updateCartItem);
router.delete("/remove", authMiddleware, removeCartItem);
router.delete("/clear", authMiddleware, clearCart);

export default router;
