import mongoose, { Schema, Document } from "mongoose";

export interface IMediaAttachment {
  url: string;
  mediaType: "image" | "video" | "audio" | "file";
  fileName: string;
  sizeBytes: number;
}

export interface IReceipt {
  userId: string; // UUID string
  readAt: Date;
}

export interface IReaction {
  userId: string; // UUID string
  emoji: string;
}

export interface IMessage {
  _mid: string; // Idempotency UUID key
  seq: number;
  senderId: string; // UUID string
  body: string;
  media?: IMediaAttachment[];
  reactions?: IReaction[];
  receipts?: IReceipt[];
  sentAt: Date;
  editedAt?: Date;
  deletedBy?: string[]; // UUID strings
}

export interface IMessageBucket extends Document {
  channelId: string; // UUID string
  seqMin: number;
  seqMax: number;
  messageCount: number;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MediaAttachmentSchema = new Schema<IMediaAttachment>({
  url: { type: String, required: true },
  mediaType: {
    type: String,
    enum: ["image", "video", "audio", "file"],
    required: true,
  },
  fileName: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
}, { _id: false });

const ReceiptSchema = new Schema<IReceipt>({
  userId: { type: String, required: true },
  readAt: { type: Date, required: true },
}, { _id: false });

const ReactionSchema = new Schema<IReaction>({
  userId: { type: String, required: true },
  emoji: { type: String, required: true },
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
  _mid: { type: String, required: true },
  seq: { type: Number, required: true },
  senderId: { type: String, required: true },
  body: { type: String, required: true },
  media: [MediaAttachmentSchema],
  reactions: [ReactionSchema],
  receipts: [ReceiptSchema],
  sentAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deletedBy: [String],
}, { _id: false });

const MessageBucketSchema = new Schema<IMessageBucket>(
  {
    channelId: { type: String, required: true, index: true },
    seqMin: { type: Number, required: true },
    seqMax: { type: Number, required: true },
    messageCount: { type: Number, required: true, default: 0 },
    messages: [MessageSchema],
  },
  {
    timestamps: true,
  }
);

// Optimize sequential read paths and open bucket insertions
MessageBucketSchema.index({ channelId: 1, seqMax: -1 });
MessageBucketSchema.index(
  { channelId: 1, messageCount: 1 },
  { partialFilterExpression: { messageCount: { $lt: 100 } } }
);
MessageBucketSchema.index({ channelId: 1, "messages._mid": 1 });

export const MessageBucket = mongoose.model<IMessageBucket>(
  "MessageBucket",
  MessageBucketSchema
);
