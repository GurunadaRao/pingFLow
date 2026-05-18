import { HydratedDocument, Model, Schema, model } from "mongoose";

export interface User {
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  avatarUrl?: string;
  bio?: string;
  isOnline?: boolean;
  lastSeen?: Date;
  socketId?: string;
  role?: "user" | "admin";
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

type UserModel = Model<User>;

const userSchema = new Schema<User, UserModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    passwordSalt: {
      type: String,
      required: true,
      select: false,
    },

    avatarUrl: { type: String, default: "" },
    bio: { type: String, maxlength: 150, default: "" },

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },

    socketId: { type: String, select: false },

    role: { type: String, enum: ["user", "admin"], default: "user" },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (
        _doc,
        ret: Partial<User> & {
          passwordHash?: string;
          passwordSalt?: string;
          socketId?: string;
        },
      ) => {
        delete ret.passwordHash;
        delete ret.passwordSalt;
        delete ret.socketId;
        return ret;
      },
    },
  },
);

export const UserModel = model<User, UserModel>("User", userSchema);
