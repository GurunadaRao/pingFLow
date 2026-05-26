import React, { useState } from "react";
import { useChatStore } from "../../store/chat-store";
import { sendMessage as apiSendMessage } from "../../lib/api/channels";

export default function MessageInput() {
  const [text, setText] = useState("");
  const { activeChannelId, addMessage, user } = useChatStore();

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeChannelId) return;
    // if empty, we could trigger voice recording — for now ignore
    if (!text.trim()) return;
    const clientMid = crypto.randomUUID();
    try {
      const msg = await apiSendMessage(activeChannelId, text.trim(), clientMid);
      addMessage(activeChannelId, {
        _mid: msg._mid || clientMid,
        seq: msg.seq,
        senderId: user?.id ?? "",
        _isOwn: true,
        body: text.trim(),
        sentAt: msg.sentAt,
        reactions: [],
        receipts: [],
      });
      setText("");
    } catch (err) {
      console.error("Send failed", err);
    }
  };

  return (
    <form
      onSubmit={handleSend}
      className="p-3 border-t bg-[#0b0c0f] flex items-center gap-3"
    >
      <button
        type="button"
        className="p-2 rounded hover:bg-white/5 text-slate-300"
      >
        ＋
      </button>
      <button
        type="button"
        className="p-2 rounded hover:bg-white/5 text-slate-300"
      >
        😊
      </button>
      <input
        id="message-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        className="flex-1 rounded-full px-4 py-2 bg-white/5 text-slate-100 placeholder:text-slate-400"
      />
      {text.trim() ? (
        <button
          type="submit"
          className="p-2 rounded-full bg-emerald-500 text-white"
        >
          Send
        </button>
      ) : (
        <button
          type="button"
          className="p-2 rounded-full hover:bg-white/5 text-slate-300"
        >
          🎤
        </button>
      )}
    </form>
  );
}