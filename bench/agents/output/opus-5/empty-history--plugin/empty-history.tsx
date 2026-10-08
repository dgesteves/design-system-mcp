"use client";

import { MessageSquareIcon, PenSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function EmptyHistory({ onNewChat }: { onNewChat?: () => void }) {
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
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent">
        <MessageSquareIcon className="size-4 text-sidebar-foreground/60" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sidebar-foreground text-sm">
          No chats yet
        </p>
        <p className="text-sidebar-foreground/60 text-xs">
          Your conversations will show up here once you start chatting.
        </p>
      </div>
      <Button onClick={handleNewChat} size="sm" variant="outline">
        <PenSquareIcon />
        New chat
      </Button>
    </div>
  );
}
