import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bomRouter from "./bom";
import sessionsRouter from "./sessions";
import analyticsRouter from "./analytics";
import feedersRouter from "./feeders";
import componentsRouter from "./components";
import traceabilityRouter from "./traceability";
import auditRouter from "./audit";
import testRouter from "./test";
import trashRouter from "./trash";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bomRouter);
router.use(sessionsRouter);
router.use(analyticsRouter);
router.use(feedersRouter);
router.use(componentsRouter);
router.use(traceabilityRouter);
router.use(auditRouter);
router.use(testRouter);
router.use(trashRouter);
router.use(dashboardRouter);

export default router;
