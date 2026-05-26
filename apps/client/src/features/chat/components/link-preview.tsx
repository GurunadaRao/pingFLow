import React from "react";

function extractHost(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default function LinkPreview({ url }: { url: string }) {
  const host = extractHost(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="block rounded-md border border-emerald-700 bg-emerald-800/90 text-emerald-50 p-3 max-w-[420px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs opacity-80 font-medium">{host}</div>
      <div className="text-sm mt-1 truncate">{url}</div>
    </a>
  );
}
