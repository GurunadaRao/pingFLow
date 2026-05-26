import React, { useEffect } from "react";
import { useChatStore } from "../../../store/chat-store";
import { fetchChannels } from "../../../lib/api/channels";

export default function ChannelSidebar() {
  const { channels, setChannels, activeChannelId, setActiveChannelId } =
    useChatStore();

  useEffect(() => {
    (async () => {
      try {
        const ch = await fetchChannels();
        setChannels(ch);
        if (ch.length && !activeChannelId) setActiveChannelId(ch[0].id);
      } catch (e) {
        console.error("Failed to load channels", e);
      }
    })();
  }, []);

  return (
    <aside className="flex w-72 flex-col border-r bg-white/3 p-2">
      <div className="p-2">
        <input
          placeholder="Search"
          className="w-full rounded bg-white/5 px-2 py-1"
        />
      </div>
      <ul className="mt-3 flex-1 overflow-y-auto">
        {channels.map((c) => (
          <li
            key={c.id}
            className={`cursor-pointer p-2 hover:bg-white/5 ${c.id === activeChannelId ? "bg-white/6" : ""}`}
            onClick={() => setActiveChannelId(c.id)}
          >
            <div className="font-medium">{c.group_name ?? c.id}</div>
            <div className="text-xs text-zinc-400">{c.last_message ?? ""}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
