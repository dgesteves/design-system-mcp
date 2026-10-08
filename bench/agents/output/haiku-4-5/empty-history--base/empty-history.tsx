"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { MessageIcon } from "./icons";

export function EmptyHistory() {
  const router = useRouter();

  const handleNewChat = useCallback(() => {
    router.push("/");
  }, [router]);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
        History
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="flex flex-col items-center justify-center gap-3 px-2 py-8">
          <div className="text-sidebar-foreground/40">
            <MessageIcon size={32} />
          </div>
          <div className="text-center">
            <p className="text-[13px] text-sidebar-foreground/60">
              Your conversations will appear here once you start chatting!
            </p>
          </div>
          <Button
            onClick={handleNewChat}
            size="sm"
            variant="outline"
            className="mt-2"
          >
            New chat
          </Button>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
