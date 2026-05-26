import { Router } from "express";

import {
  loginHandler,
  googleHandler,
  logoutHandler,
  logoutAllDevicesHandler,
  profileHandler,
  refreshTokenHandler,
  registerHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const authRouter = Router();

// Public routes
authRouter.post("/register", registerHandler);
/* verify-email route removed */
authRouter.post("/login", loginHandler);
authRouter.post("/google", googleHandler);
authRouter.post("/refresh", refreshTokenHandler);
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/reset-password", resetPasswordHandler);

// Protected routes
authRouter.post("/logout", authMiddleware, logoutHandler);
authRouter.post("/logout-all-devices", authMiddleware, logoutAllDevicesHandler);
authRouter.get("/profile", authMiddleware, profileHandler);
