import { Router } from "express";
import {
  createChannelHandler,
  getUserChannelsHandler,
  addChannelMemberHandler,
  removeChannelMemberHandler,
  getChannelPresenceHandler,
} from "../controllers/channel.controller";
import {
  sendMessageHandler,
  listMessagesHandler,
  getMessageHandler,
  editMessageHandler,
  deleteMessageHandler,
  addReactionHandler,
  removeReactionHandler,
  markAsReadHandler,
} from "../controllers/message.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { createRateLimiter } from "../middleware/rate-limiter.middleware";

export const channelRouter = Router();

// Apply auth middleware globally to all channel routes
channelRouter.use(authMiddleware);

// Define rate limiters for messaging operations
const sendLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: "msg-send",
});

const readLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 500,
  keyPrefix: "msg-read",
});

// Channel Operations
channelRouter.post("/", createChannelHandler);
channelRouter.get("/", getUserChannelsHandler);
channelRouter.get("/:id/presence", getChannelPresenceHandler);

// Message Operations
channelRouter.post("/:id/messages", sendLimiter, sendMessageHandler);
channelRouter.get("/:id/messages", readLimiter, listMessagesHandler);
channelRouter.get("/:id/messages/:seq", getMessageHandler);
channelRouter.put("/:id/messages/:seq", editMessageHandler);
channelRouter.delete("/:id/messages/:seq", deleteMessageHandler);
channelRouter.post("/:id/messages/:seq/reactions", addReactionHandler);
channelRouter.delete("/:id/messages/:seq/reactions/:emoji", removeReactionHandler);
channelRouter.post("/:id/messages/:seq/read", markAsReadHandler);

// Member Operations
channelRouter.post("/:id/members", addChannelMemberHandler);
channelRouter.delete("/:id/members/:userId", removeChannelMemberHandler);
export default channelRouter;
