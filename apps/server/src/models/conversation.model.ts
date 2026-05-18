import { HydratedDocument, Model, Schema, model } from "mongoose";

export interface Conversation {
  name?: string;
  description?: string;
  isGroupChat: boolean;
  members: string[]; // User IDs
  createdBy: string; // User ID
  avatar?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<Conversation>;

type ConversationModel = Model<Conversation>;

const conversationSchema = new Schema<Conversation, ConversationModel>(
  {
    name: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    isGroupChat: {
      type: Boolean,
      default: false,
      index: true,
    },

    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
    ],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    avatar: {
      type: String,
    },

    lastMessageAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// index for quick lookups of conversations by member
conversationSchema.index({ members: 1 });

export const ConversationModel = model<Conversation, ConversationModel>(
  "Conversation",
  conversationSchema,
);
