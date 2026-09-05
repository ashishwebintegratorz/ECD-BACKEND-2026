import { Router } from "express";
import {
  getAllZones,
  getActiveZones,
  createCityZone,
  updateCityZone,
  deleteCityZone,
  addSubArea,
  updateSubArea,
  deleteSubArea,
  checkLocationZone,
} from "../controllers/zone.controller.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { validateObjectId } from "../middlewares/validateObjectId.middleware.js";
import {
  createCityZoneSchema,
  updateCityZoneSchema,
  addSubAreaSchema,
  updateSubAreaSchema,
} from "../validators/zone.validator.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";

const router = Router();

// Public / Mobile Client endpoints
router.get("/active", asyncHandler(getActiveZones));
router.get("/check", asyncHandler(checkLocationZone));

// Admin Management endpoints: Cities
router.get("/", jwtAuth, requireRole("admin"), asyncHandler(getAllZones));
router.post("/", jwtAuth, requireRole("admin"), validate(createCityZoneSchema), asyncHandler(createCityZone));
router.put("/:id", jwtAuth, requireRole("admin"), validateObjectId("id"), validate(updateCityZoneSchema), asyncHandler(updateCityZone));
router.delete("/:id", jwtAuth, requireRole("admin"), validateObjectId("id"), asyncHandler(deleteCityZone));

// Admin Management endpoints: Sub-Areas within a City
router.post("/:zoneId/sub-areas", jwtAuth, requireRole("admin"), validateObjectId("zoneId"), validate(addSubAreaSchema), asyncHandler(addSubArea));
router.put("/:zoneId/sub-areas/:subAreaId", jwtAuth, requireRole("admin"), validateObjectId("zoneId"), validateObjectId("subAreaId"), validate(updateSubAreaSchema), asyncHandler(updateSubArea));
router.delete("/:zoneId/sub-areas/:subAreaId", jwtAuth, requireRole("admin"), validateObjectId("zoneId"), validateObjectId("subAreaId"), asyncHandler(deleteSubArea));

export default router;
