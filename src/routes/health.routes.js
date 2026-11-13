import express from "express";
import { get_health_status } from "../controllers/health.controller.js";

const router = express.Router();

router.get("/", get_health_status);

export default router;