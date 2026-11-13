import { Router } from "express";
import invitations from "./admin/invitations.js";
import overview from "./admin/overview.js";
import users from "./admin/users.js";
import emails from "./admin/emails.js";
import sessions from "./admin/sessions.js";
import billing from "./admin/billing.js";
import instructions from "./admin/instructions.js";
import models from "./admin/models.js";
import checklist from "./admin/checklist.js";

const router = Router();
router.use(invitations);
router.use(overview);
router.use(users);
router.use(emails);
router.use(sessions);
router.use(billing);
router.use(instructions);
router.use(models);
router.use(checklist);

export default router;
