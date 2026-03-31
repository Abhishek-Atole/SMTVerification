import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bomRouter from "./bom";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bomRouter);
router.use(sessionsRouter);

export default router;
