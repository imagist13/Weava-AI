"use client";

import { Sparkles } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  onCompile: () => void;
  isStreaming?: boolean;
}

export default function SelectionToolbar({
  selectedCount,
  onCompile,
  isStreaming,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="pointer-events-auto absolute left-1/2 bottom-2 z-30 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-neutral-150 bg-white px-1.5 py-1 animate-fade-in"
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      {/* Count chip */}
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <span className="size-1.5 rounded-full bg-indigo-500" />
        <span className="text-[11.5px] font-medium text-neutral-600">
          {selectedCount} selected
        </span>
      </div>

      <div className="h-4 w-px bg-neutral-100" />

      {/* Compile — Linear dark CTA */}
      <button
        onClick={onCompile}
        disabled={isStreaming}
        className="flex h-6 items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40"
      >
        {isStreaming ? (
          <>
            <span className="size-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Generating
          </>
        ) : (
          <>
            <Sparkles className="size-3" />
            Compile prompt
          </>
        )}
      </button>
    </div>
  );
}
