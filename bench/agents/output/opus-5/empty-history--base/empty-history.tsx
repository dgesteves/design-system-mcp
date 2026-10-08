"use client";

import { MessageSquareIcon, PenSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function EmptyHistory({
  className,
  onNewChat,
}: {
  className?: string;
  onNewChat?: () => void;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  const handleNewChat = useCallback(() => {
    setOpenMobile(false);

    if (onNewChat) {
      onNewChat();
      return;
    }

    router.push("/");
  }, [onNewChat, router, setOpenMobile]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-3 py-6 text-center",
        className
      )}
      data-testid="empty-history"
    >
      <div className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/50">
        <MessageSquareIcon className="size-4 text-sidebar-foreground/50" />
      </div>
      <p className="text-[13px] text-sidebar-foreground/60">
        No chats yet. Start a conversation and it will show up here.
      </p>
      <Button
        className="h-8 w-full border-sidebar-border text-[13px] text-sidebar-foreground/70 hover:text-sidebar-foreground"
        onClick={handleNewChat}
        size="sm"
        type="button"
        variant="outline"
      >
        <PenSquareIcon className="size-4" data-icon="inline-start" />
        <span className="font-medium">New chat</span>
      </Button>
    </div>
  );
}
