import { HydratedDocument, Model, Schema, model } from "mongoose";

export interface Message {
  conversationId: string; // Conversation ID
  senderId: string; // User ID
  type: "text" | "image" | "file" | "audio" | "video";
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  replyTo?: string; // Message ID
  status: "sent" | "delivered" | "seen";
  seenBy: string[]; // User IDs
  deletedFor: string[]; // User IDs
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HybratedDocument<Message>;

type MessageModel = Model<Message>;

const messageSchema = new Schema<Message, MessageModel>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["text", "image", "file", "audio", "video"],
      default: "text",
    },

    text: {
      type: String,
      trim: true,
    },

    mediaUrl: {
      type: String,
    },

    mediaType: {
      type: String,
    },

    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },

    seenBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// index for quick lookups of messages by conversation
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const MessageModel = model<Message, MessageModel>(
  "Message",
  messageSchema,
);
