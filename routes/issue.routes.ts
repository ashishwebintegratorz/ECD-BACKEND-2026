import { Router } from "express";
import { reportIssue, getIssues, updateIssueStatus } from "../controllers/issue.controller.js";
import { jwtAuth } from "../middlewares/jwtAuth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

// Endpoint for users to report an issue for a delivered order
router.post("/report", jwtAuth, requireRole("customer"), reportIssue);

// Endpoint for admins to view all issues
router.get("/", jwtAuth, requireRole("admin"), getIssues);

// Endpoint for admins to update issue status
router.put("/:id/status", jwtAuth, requireRole("admin"), updateIssueStatus);

export default router;
