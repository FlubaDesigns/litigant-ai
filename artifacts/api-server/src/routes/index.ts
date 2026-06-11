import { Router, type IRouter } from "express";
import healthRouter from "./health";
import brainRouter from "./brain";
import sessionsRouter from "./sessions";
import templatesRouter from "./templates";
import accountRouter from "./account";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brainRouter);
router.use(sessionsRouter);
router.use(templatesRouter);
router.use(accountRouter);
router.use(billingRouter);

export default router;
