"use client";

import { AlertCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type UsageBannerProps = {
  onUpgradeClick?: () => void;
};

export function UsageBanner({ onUpgradeClick }: UsageBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircleIcon className="size-5 shrink-0" />

      <span className="flex-1">
        You've used 90% of your messages this month
      </span>

      <Button
        onClick={onUpgradeClick}
        size="xs"
        variant="default"
        className="shrink-0"
      >
        Upgrade
      </Button>

      <Button
        onClick={() => setIsDismissed(true)}
        size="icon-xs"
        variant="ghost"
        className="shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
