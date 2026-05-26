import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../store/chat-store";
import { fetchMessages } from "../../lib/api/channels";
import { joinChannel, leaveChannel } from "../../sockets/socket-service";
import MessageBubble from "./MessageBubble";
// Use a small inline SVG icon to avoid external dependency issues

export default function ChatView() {
  const { activeChannelId, messagesByChannel, setMessages } = useChatStore();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeChannelId) return;

    (async () => {
      try {
        const res = await fetchMessages(activeChannelId);
        setMessages(
          activeChannelId,
          res.messages.map((m: any) => ({
            ...m,
            sentAt: m.sentAt,
          })),
        );
      } catch (e) {
        console.error("Failed to load messages", e);
      }
    })();

    // Join socket room
    joinChannel(activeChannelId);
    return () => {
      leaveChannel(activeChannelId);
    };
  }, [activeChannelId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, activeChannelId]);

  const msgs = (activeChannelId && messagesByChannel[activeChannelId]) || [];
  // Empty state when no messages
  const EmptyState = (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 shadow-sm p-8 text-center">
        <div className="flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-12 w-12 text-slate-300"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 12h9M7.5 16h6M21 12c0 4.418-4.03 8-9 8-1.056 0-2.068-.16-3-.457L3 21l1.457-6.0A8.962 8.962 0 0 1 3 12C3 7.582 7.03 4 12 4s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">
          No messages yet
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Start the conversation — your messages will appear here.
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              (
                document.getElementById("message-input") as HTMLElement | null
              )?.focus()
            }
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            Send a message
          </button>
        </div>
      </div>
    </div>
  );

  // Helper to render date separators
  const renderWithDateSeparators = (messages: any[]) => {
    const out: React.ReactNode[] = [];
    let lastDate: string | null = null;
    messages.forEach((m: any, i: number) => {
      const d = new Date(m.sentAt || Date.now());
      const dayKey = d.toDateString();
      if (dayKey !== lastDate) {
        out.push(
          <div key={`sep-${i}`} className="flex justify-center py-2">
            <span className="text-xs rounded px-3 py-1 bg-slate-800 text-slate-300">
              {dayKey === new Date().toDateString() ? "Today" : dayKey}
            </span>
          </div>,
        );
        lastDate = dayKey;
      }
      const storeUserId = useChatStore.getState().user?.id;
      const isOwn =
        m._isOwn === true ||
        (m.senderId && storeUserId && m.senderId === storeUserId);
      out.push(
        <div
          key={m._mid || m.seq}
          className={`flex w-full ${isOwn ? "justify-end" : "justify-start"} px-2`}
        >
          <MessageBubble message={m} isOwn={isOwn} />
        </div>,
      );
    });
    return out;
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0b0c0f]">
        <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-white">
          A
        </div>
        <div className="flex-1">
          <div className="font-semibold text-slate-100">Contact Name</div>
          <div className="text-xs text-slate-400">online</div>
        </div>
        <div className="flex items-center gap-3 text-slate-300">
          <button aria-label="video" className="p-2 rounded hover:bg-white/5">
            🎥
          </button>
          <button aria-label="search" className="p-2 rounded hover:bg-white/5">
            🔍
          </button>
          <button aria-label="more" className="p-2 rounded hover:bg-white/5">
            ⋮
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0f1115]">
        {msgs.length === 0 ? EmptyState : renderWithDateSeparators(msgs)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
