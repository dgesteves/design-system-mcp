"use client";

import { Button } from "@/components/ui/button";
import { MessageIcon } from "./icons";

interface EmptyHistoryProps {
  onNewChat?: () => void;
}

export const EmptyHistory = ({ onNewChat }: EmptyHistoryProps) => (
  <div className="flex flex-col items-center justify-center gap-4 px-4 py-8">
    <div className="text-sidebar-foreground/40">
      <MessageIcon size={32} />
    </div>
    <div className="flex flex-col items-center gap-2">
      <h2 className="text-sm font-semibold text-sidebar-foreground">
        No conversations yet
      </h2>
      <p className="text-xs text-sidebar-foreground/60">
        Start a new chat to begin
      </p>
    </div>
    <Button
      onClick={onNewChat}
      size="sm"
      variant="outline"
      className="mt-2"
    >
      New chat
    </Button>
  </div>
);
