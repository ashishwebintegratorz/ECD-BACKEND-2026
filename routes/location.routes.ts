import { Router } from "express";
import {
  checkLocationZone,
  getLocationCities,
} from "../controllers/location.controller.js";

const router = Router();

// POST /api/v1/location/check-zone
router.post("/check-zone", checkLocationZone);

// GET /api/v1/location/cities
router.get("/cities", getLocationCities);

export default router;
