import React, { useEffect } from "react";
import { useChatStore } from "../../store/chat-store";
import { fetchChannels } from "../../lib/api/channels";

export default function SideBar() {
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
    <aside className="w-72 border-r bg-white/3 p-2 flex flex-col">
      <div className="p-2">
        <input
          placeholder="Search"
          className="w-full rounded px-2 py-1 bg-white/5"
        />
      </div>
      <ul className="mt-3 overflow-y-auto flex-1">
        {channels.map((c) => (
          <li
            key={c.id}
            className={`p-2 cursor-pointer hover:bg-white/5 ${c.id === activeChannelId ? "bg-white/6" : ""}`}
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
