import React from "react";
import LinkPreview from "./link-preview";

const urlRegex = /(https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+)/i;

function findUrl(text: string) {
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

export default function MessageBubble({
  message,
  isOwn,
}: {
  message: any;
  isOwn: boolean;
}) {
  const url = findUrl(message.body || "");
  return (
    <div className="inline-block max-w-[70%]">
      <div
        className={`inline-block rounded-lg p-3 shadow-sm break-words ${
          isOwn ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-100"
        }`}
        style={{ borderRadius: 12 }}
      >
        {url ? (
          <div className="flex flex-col gap-2">
            <LinkPreview url={url} />
            <div className="text-sm">
              {message.body.replace(url, "").trim()}
            </div>
          </div>
        ) : (
          <div className="text-sm">{message.body}</div>
        )}
        <div className="mt-2 text-right text-[11px] opacity-60">
          {message.sentAt ? new Date(message.sentAt).toLocaleTimeString() : ""}
        </div>
      </div>
    </div>
  );
}
