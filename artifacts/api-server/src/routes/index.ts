import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import brainRouter from "./brain";
import sessionsRouter from "./sessions";
import templatesRouter from "./templates";
import accountRouter from "./account";
import billingRouter from "./billing";
import adminRouter from "./admin";
import reportRouter from "./report";
import providersRouter from "./providers";
import webhookRouter from "./webhook";
import caseFileRouter from "./caseFile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(brainRouter);
router.use(sessionsRouter);
router.use(templatesRouter);
router.use(accountRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(reportRouter);
router.use(providersRouter);
router.use(webhookRouter);
router.use(caseFileRouter);

export default router;
