import { Router } from "express";

import {
  loginHandler,
  profileHandler,
  refreshTokenHandler,
  registerHandler,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const authRouter = Router();

authRouter.post("/register", registerHandler);
authRouter.post("/login", loginHandler);
authRouter.post("/refresh", refreshTokenHandler);
authRouter.get("/profile", authMiddleware, profileHandler);
