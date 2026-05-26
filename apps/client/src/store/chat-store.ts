import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_s3_key?: string | null;
  about_text?: string | null;
  account_status: string;
  last_seen_at?: string | null;
}

export interface Channel {
  id: string;
  channel_type: "direct" | "group";
  group_name?: string | null;
  group_avatar_s3_key?: string | null;
  group_description?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
}

export interface IMessage {
  _mid: string;
  seq: number;
  senderId: string;
  body: string;
  sentAt: string | Date;
  editedAt?: string | Date | null;
  deletedBy?: string[];
  reactions: Array<{ userId: string; emoji: string }>;
  receipts: Array<{ userId: string; readAt: string | Date }>;
  media?: Array<{
    url: string;
    mediaType: "image" | "video" | "audio" | "file";
    fileName: string;
    sizeBytes: number;
  }>;
}

interface PresenceState {
  status: "online" | "away" | "offline";
  lastSeenAt: string;
  platform: string;
}

interface ChatStore {
  user: User | null;
  channels: Channel[];
  messagesByChannel: Record<string, IMessage[]>;
  typingUsers: Record<string, string[]>; // channelId -> array of displayNames
  presence: Record<string, PresenceState>; // userId -> state
  activeChannelId: string | null;
  socketConnected: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;
  updateChannelLastMessage: (channelId: string, text: string, time: string) => void;
  incrementUnreadCount: (channelId: string) => void;
  clearUnreadCount: (channelId: string) => void;
  setActiveChannelId: (channelId: string | null) => void;
  setSocketConnected: (connected: boolean) => void;

  // Message Actions
  setMessages: (channelId: string, messages: IMessage[]) => void;
  addMessage: (channelId: string, message: IMessage) => void;
  updateMessage: (channelId: string, seq: number, updates: Partial<IMessage>) => void;
  deleteMessageFromStore: (channelId: string, seq: number) => void;

  // Typing Actions
  setTypingUsers: (channelId: string, users: string[]) => void;

  // Presence Actions
  setPresence: (userId: string, state: PresenceState) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  user: null,
  channels: [],
  messagesByChannel: {},
  typingUsers: {},
  presence: {},
  activeChannelId: null,
  socketConnected: false,

  setUser: (user) => set({ user }),
  setChannels: (channels) => set({ channels }),
  addChannel: (channel) =>
    set((state) => ({
      channels: [channel, ...state.channels.filter((c) => c.id !== channel.id)],
    })),
  updateChannelLastMessage: (channelId, text, time) =>
    set((state) => ({
      channels: state.channels
        .map((c) =>
          c.id === channelId
            ? { ...c, last_message: text, last_message_at: time }
            : c
        )
        .sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        }),
    })),
  incrementUnreadCount: (channelId) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unread_count: (c.unread_count || 0) + 1 } : c
      ),
    })),
  clearUnreadCount: (channelId) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unread_count: 0 } : c
      ),
    })),
  setActiveChannelId: (activeChannelId) => set({ activeChannelId }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
      },
    })),
  addMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      // Prevent duplicates by _mid or seq
      const filtered = existing.filter((m) => m._mid !== message._mid && m.seq !== message.seq);
      const updated = [...filtered, message].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        },
      };
    }),
  updateMessage: (channelId, seq, updates) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      const updated = existing.map((m) => (m.seq === seq ? { ...m, ...updates } : m));
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        },
      };
    }),
  deleteMessageFromStore: (channelId, seq) =>
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      const updated = existing.map((m) =>
        m.seq === seq
          ? { ...m, body: "This message has been deleted", deletedBy: ["system"] }
          : m
      );
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: updated,
        },
      };
    }),

  setTypingUsers: (channelId, users) =>
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [channelId]: users,
      },
    })),

  setPresence: (userId, state) =>
    set((prev) => ({
      presence: {
        ...prev.presence,
        [userId]: state,
      },
    })),
}));
