import { Request, Response } from "express";
import { ChannelService } from "../services/channel.service";
import { MessageService } from "../services/message.service";
import {
  validateSendMessageInput,
  validateEditMessageInput,
  validateMessageListQuery,
  validateMessageSeqParam,
  validateReactionInput,
} from "../validations/message.validation";

function handleMessageError(error: unknown, res: Response): Response {
  console.error("❌ Message Controller Error:", error);
  if (error instanceof Error) {
    if (
      error.message.includes("not a member") ||
      error.message.includes("Unauthorized")
    ) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: "Internal server error" });
}

export async function sendMessageHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const senderId = req.auth?.userId;

    if (!senderId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = validateSendMessageInput(req.body);
    await ChannelService.assertChannelMembership(channelId, senderId);

    const { message, alreadyExists } = await MessageService.createMessage(
      channelId,
      senderId,
      {
        clientMid: payload.clientMid,
        body: payload.body,
        media: payload.media,
      },
    );

    return res.status(alreadyExists ? 200 : 201).json({
      message: {
        _mid: message._mid,
        seq: message.seq,
        sentAt: message.sentAt,
      },
    });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function listMessagesHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const query = validateMessageListQuery(req.query);
    await ChannelService.assertChannelMembership(channelId, userId);

    const { messages, nextCursor, hasMore } =
      await MessageService.getMessageHistory(
        channelId,
        query.beforeSeq,
        query.limit,
      );

    return res.status(200).json({
      messages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function getMessageHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.getMessageBySeq(channelId, seq);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function editMessageHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    const payload = validateEditMessageInput(req.body);
    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.editMessage(
      channelId,
      seq,
      userId,
      payload.body,
    );

    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function deleteMessageHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.deleteMessage(channelId, seq, userId);
    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function addReactionHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    const payload = validateReactionInput(req.body);
    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.addReaction(
      channelId,
      seq,
      userId,
      payload.emoji,
    );

    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function removeReactionHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    const emoji = req.params.emoji;

    if (!emoji || emoji.trim().length === 0) {
      return res.status(400).json({ error: "emoji parameter is required" });
    }

    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.removeReaction(
      channelId,
      seq,
      userId,
      emoji,
    );

    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}

export async function markAsReadHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const channelId = req.params.id;
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const seq = validateMessageSeqParam(req.params);
    await ChannelService.assertChannelMembership(channelId, userId);

    const message = await MessageService.markAsRead(channelId, seq, userId);
    return res.status(200).json({ message });
  } catch (error) {
    return handleMessageError(error, res);
  }
}
