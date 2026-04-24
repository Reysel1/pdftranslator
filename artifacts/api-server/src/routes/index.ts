import { Router, type IRouter } from "express";
import healthRouter from "./health";
import translateRouter from "./translate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(translateRouter);

export default router;
