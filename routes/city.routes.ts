import { Router } from "express";
import {
  getActiveCities,
  getAllCities,
  createCity,
  updateCity,
  deleteCity,
} from "../controllers/city.controller.js";

const router = Router();

// Public route for mobile apps to get active cities
router.get("/active", getActiveCities);

// Admin routes for city management
router.get("/", getAllCities);
router.post("/", createCity);
router.put("/:id", updateCity);
router.delete("/:id", deleteCity);

export default router;
