import type { Channel, IMessage } from "../../store/chat-store";

const API_ORIGIN = import.meta.env.VITE_API_URL || "http://localhost:4001";
const API_BASE = `${API_ORIGIN}/api/v1/channels`;

function getHeaders() {
  const token = window.localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchChannels(): Promise<Channel[]> {
  const res = await fetch(API_BASE, {
    method: "GET",
    headers: getHeaders(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to fetch channels");
  }

  return (data?.channels ?? []) as Channel[];
}

export interface CreateChannelPayload {
  channelType: "direct" | "group";
  groupName?: string;
  groupDescription?: string;
  memberIds: string[];
}

export async function createChannel(
  payload: CreateChannelPayload,
): Promise<Channel> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to create channel");
  }

  return data.channel as Channel;
}

export async function fetchMessages(
  channelId: string,
  beforeSeq?: number,
  limit = 50,
): Promise<{
  messages: IMessage[];
  nextCursor: number | null;
  hasMore: boolean;
}> {
  let url = `${API_BASE}/${channelId}/messages?limit=${limit}`;
  if (typeof beforeSeq === "number") {
    url += `&beforeSeq=${beforeSeq}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to fetch messages");
  }

  return {
    messages: data.messages ?? [],
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
  };
}

export async function sendMessage(
  channelId: string,
  body: string,
  clientMid: string,
): Promise<IMessage> {
  const res = await fetch(`${API_BASE}/${channelId}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ body, clientMid }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to send message");
  }

  // The server returns message with { _mid, seq, sentAt }
  return {
    _mid: data.message._mid,
    seq: data.message.seq,
    senderId: "", // Will be filled from current user
    body,
    sentAt: data.message.sentAt,
    reactions: [],
    receipts: [],
  } as IMessage;
}

export async function editMessage(
  channelId: string,
  seq: number,
  body: string,
): Promise<IMessage> {
  const res = await fetch(`${API_BASE}/${channelId}/messages/${seq}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ body }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to edit message");
  }

  return data.message as IMessage;
}

export async function deleteMessage(
  channelId: string,
  seq: number,
): Promise<IMessage> {
  const res = await fetch(`${API_BASE}/${channelId}/messages/${seq}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to delete message");
  }

  return data.message as IMessage;
}

export async function addReaction(
  channelId: string,
  seq: number,
  emoji: string,
): Promise<IMessage> {
  const res = await fetch(
    `${API_BASE}/${channelId}/messages/${seq}/reactions`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ emoji }),
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to add reaction");
  }

  return data.message as IMessage;
}

export async function removeReaction(
  channelId: string,
  seq: number,
  emoji: string,
): Promise<IMessage> {
  const res = await fetch(
    `${API_BASE}/${channelId}/messages/${seq}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to remove reaction");
  }

  return data.message as IMessage;
}

export async function markMessageAsRead(
  channelId: string,
  seq: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/${channelId}/messages/${seq}/read`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Failed to mark message as read");
  }
}
