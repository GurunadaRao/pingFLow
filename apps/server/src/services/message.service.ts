import { MessageBucket, IMessage } from "../models/message-bucket.model";
import { ChannelService } from "./channel.service";
import { RedisService } from "./redis.service";
import { SequenceService } from "./sequence.service";

export interface CreateMessagePayload {
  clientMid: string;
  body: string;
  media?: Array<{
    url: string;
    mediaType: "image" | "video" | "audio" | "file";
    fileName: string;
    sizeBytes: number;
  }>;
}

export class MessageService {
  static async createMessage(
    channelId: string,
    senderId: string,
    payload: CreateMessagePayload,
  ): Promise<{ message: IMessage; alreadyExists: boolean }> {
    const existingBucket = await MessageBucket.findOne(
      { channelId, "messages._mid": payload.clientMid },
      { messages: { $elemMatch: { _mid: payload.clientMid } } },
    ).lean();

    if (existingBucket?.messages?.length) {
      return {
        message: existingBucket.messages[0],
        alreadyExists: true,
      };
    }

    const seq = await SequenceService.getNextSequence(channelId);
    const message: IMessage = {
      _mid: payload.clientMid,
      seq,
      senderId,
      body: payload.body,
      media: payload.media,
      reactions: [],
      receipts: [],
      sentAt: new Date(),
    };

    const updatedBucket = await MessageBucket.findOneAndUpdate(
      { channelId, messageCount: { $lt: 100 } },
      {
        $push: { messages: message },
        $inc: { messageCount: 1 },
        $set: { seqMax: seq },
      },
      {
        sort: { seqMax: -1 },
        new: true,
      },
    );

    if (updatedBucket) {
      await this.incrementUnreadForRecipients(channelId, senderId);
      await RedisService.publishChatEvent(channelId, {
        event: "message.created",
        message,
      });
      return { message, alreadyExists: false };
    }

    const createdBucket = await MessageBucket.create({
      channelId,
      seqMin: seq,
      seqMax: seq,
      messageCount: 1,
      messages: [message],
    });

    if (!createdBucket) {
      throw new Error("Failed to persist message bucket");
    }

    await this.incrementUnreadForRecipients(channelId, senderId);
    await RedisService.publishChatEvent(channelId, {
      event: "message.created",
      message,
    });
    return { message, alreadyExists: false };
  }

  static async getMessageHistory(
    channelId: string,
    beforeSeq?: number,
    limit = 50,
  ): Promise<{
    messages: IMessage[];
    nextCursor: number | null;
    hasMore: boolean;
  }> {
    const filter: Record<string, unknown> = { channelId };

    if (typeof beforeSeq === "number") {
      filter.seqMax = { $lt: beforeSeq };
    }

    const buckets = await MessageBucket.find(filter)
      .sort({ seqMax: -1 })
      .limit(10)
      .lean();

    const collected: IMessage[] = [];

    for (const bucket of buckets) {
      const bucketMessages = bucket.messages
        .filter((message) =>
          beforeSeq !== undefined ? message.seq < beforeSeq : true,
        )
        .sort((a, b) => b.seq - a.seq);

      for (const msg of bucketMessages) {
        if (collected.length < limit) {
          collected.push(msg);
        }
      }

      if (collected.length >= limit) {
        break;
      }
    }

    const messages = collected.slice(0, limit);
    const nextCursor =
      messages.length === limit ? messages[messages.length - 1].seq : null;
    const hasMore = messages.length === limit && buckets.length === 10;

    return { messages, nextCursor, hasMore };
  }

  static async getMessageBySeq(
    channelId: string,
    seq: number,
  ): Promise<IMessage | null> {
    const bucket = await MessageBucket.findOne(
      { channelId, "messages.seq": seq },
      { messages: { $elemMatch: { seq } } },
    ).lean();

    return bucket?.messages?.[0] ?? null;
  }

  static async editMessage(
    channelId: string,
    seq: number,
    senderId: string,
    body: string,
  ): Promise<IMessage> {
    const updated = await MessageBucket.findOneAndUpdate(
      { channelId, "messages.seq": seq, "messages.senderId": senderId },
      {
        $set: {
          "messages.$.body": body,
          "messages.$.editedAt": new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!updated || !updated.messages?.length) {
      throw new Error("Message not found or permission denied");
    }

    const message = updated.messages.find((m) => m.seq === seq);
    if (!message) {
      throw new Error("Message not found in bucket");
    }

    await RedisService.publishChatEvent(channelId, {
      event: "message.edited",
      seq: message.seq,
      body: message.body,
      editedAt: message.editedAt,
    });

    return message;
  }

  static async deleteMessage(
    channelId: string,
    seq: number,
    userId: string,
  ): Promise<IMessage> {
    const updated = await MessageBucket.findOneAndUpdate(
      { channelId, "messages.seq": seq, "messages.senderId": userId },
      {
        $set: {
          "messages.$.deletedBy": [userId],
        },
      },
      { new: true },
    ).lean();

    if (!updated || !updated.messages?.length) {
      throw new Error("Message not found or permission denied");
    }

    const message = updated.messages.find((m) => m.seq === seq);
    if (!message) {
      throw new Error("Message not found in bucket");
    }

    await RedisService.publishChatEvent(channelId, {
      event: "message.deleted",
      seq: message.seq,
    });

    return message;
  }

  static async addReaction(
    channelId: string,
    seq: number,
    userId: string,
    emoji: string,
  ): Promise<IMessage> {
    // Pull first to avoid duplicates (idempotency)
    await MessageBucket.updateOne(
      { channelId, "messages.seq": seq },
      { $pull: { "messages.$[msg].reactions": { userId, emoji } } },
      { arrayFilters: [{ "msg.seq": seq }] }
    );

    const updated = await MessageBucket.findOneAndUpdate(
      { channelId, "messages.seq": seq },
      { $push: { "messages.$[msg].reactions": { userId, emoji } } },
      { arrayFilters: [{ "msg.seq": seq }], new: true }
    ).lean();

    if (!updated || !updated.messages?.length) {
      throw new Error("Message not found");
    }

    const message = updated.messages.find((m) => m.seq === seq);
    if (!message) {
      throw new Error("Message not found in bucket");
    }

    await RedisService.publishChatEvent(channelId, {
      event: "reaction.added",
      seq,
      userId,
      emoji,
    });

    return message;
  }

  static async removeReaction(
    channelId: string,
    seq: number,
    userId: string,
    emoji: string,
  ): Promise<IMessage> {
    const updated = await MessageBucket.findOneAndUpdate(
      { channelId, "messages.seq": seq },
      { $pull: { "messages.$[msg].reactions": { userId, emoji } } },
      { arrayFilters: [{ "msg.seq": seq }], new: true }
    ).lean();

    if (!updated || !updated.messages?.length) {
      throw new Error("Message not found");
    }

    const message = updated.messages.find((m) => m.seq === seq);
    if (!message) {
      throw new Error("Message not found in bucket");
    }

    await RedisService.publishChatEvent(channelId, {
      event: "reaction.removed",
      seq,
      userId,
      emoji,
    });

    return message;
  }

  static async markAsRead(
    channelId: string,
    seq: number,
    userId: string,
  ): Promise<IMessage> {
    const readAt = new Date();

    // Pull first to ensure only one receipt entry exists for this user on the message
    await MessageBucket.updateOne(
      { channelId, "messages.seq": seq },
      { $pull: { "messages.$[msg].receipts": { userId } } },
      { arrayFilters: [{ "msg.seq": seq }] }
    );

    const updated = await MessageBucket.findOneAndUpdate(
      { channelId, "messages.seq": seq },
      { $push: { "messages.$[msg].receipts": { userId, readAt } } },
      { arrayFilters: [{ "msg.seq": seq }], new: true }
    ).lean();

    if (!updated || !updated.messages?.length) {
      throw new Error("Message not found");
    }

    const message = updated.messages.find((m) => m.seq === seq);
    if (!message) {
      throw new Error("Message not found in bucket");
    }

    // Reset unread counts in Redis
    await RedisService.resetUnread(userId, channelId);

    await RedisService.publishChatEvent(channelId, {
      event: "message.read",
      seq,
      userId,
      readAt,
    });

    return message;
  }

  private static async incrementUnreadForRecipients(
    channelId: string,
    senderId: string,
  ): Promise<void> {
    const memberIds = await ChannelService.getActiveMemberIds(channelId);
    const recipientIds = memberIds.filter((memberId) => memberId !== senderId);

    await Promise.all(
      recipientIds.map((recipientId) =>
        RedisService.incrementUnread(recipientId, channelId),
      ),
    );
  }
}
