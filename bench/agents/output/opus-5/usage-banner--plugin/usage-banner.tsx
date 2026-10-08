"use client";

import { XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WarningIcon } from "./icons";

type UsageBannerProps = {
  /** Share of the monthly message limit already used, from 0 to 100. */
  percentUsed: number;
  /** Below this usage the banner stays hidden. */
  threshold?: number;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function UsageBanner({
  percentUsed,
  threshold = 80,
  onUpgrade,
  onDismiss,
  className,
}: UsageBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  if (isDismissed || percentUsed < threshold) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5",
        className
      )}
      data-testid="usage-banner"
      role="status"
    >
      <span className="text-destructive">
        <WarningIcon size={16} />
      </span>

      <p className="min-w-0 flex-1 text-sm text-foreground">
        You&apos;ve used {Math.round(percentUsed)}% of your messages this month
      </p>

      <Button onClick={onUpgrade} size="sm" type="button">
        Upgrade
      </Button>

      <Button
        aria-label="Dismiss"
        onClick={handleDismiss}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
