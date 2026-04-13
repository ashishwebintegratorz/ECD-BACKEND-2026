import express from "express";
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  clearWishlist,
} from "../controllers/whistlist.controller.js";
import auth from "../middlewares/jwtAuth.middleware.js";

const router = express.Router();

router.get("/", auth, getWishlist);
router.post("/", auth, addToWishlist);
router.delete("/:productId", auth, removeFromWishlist);
router.delete("/", auth, clearWishlist);

export default router;
