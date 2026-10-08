"use client";

import { TriangleAlertIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type UsageBannerProps = {
  /** Messages the user has sent this month. */
  used: number;
  /** Messages included in the user's monthly plan. */
  limit: number;
  /** Percentage of the limit at which the banner starts showing. */
  threshold?: number;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function UsageBanner({
  used,
  limit,
  threshold = 90,
  onUpgrade,
  onDismiss,
  className,
}: UsageBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  const usedPercent =
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  if (isDismissed || usedPercent < threshold) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-3 py-2.5 shadow-[var(--shadow-card)]",
        className
      )}
      data-testid="usage-banner"
      role="status"
    >
      <TriangleAlertIcon className="size-4 shrink-0 text-muted-foreground" />

      <p className="flex-1 text-[13px] leading-snug text-foreground">
        You&apos;ve used {usedPercent}% of your messages this month
      </p>

      <Button onClick={onUpgrade} size="sm">
        Upgrade
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="usage-banner-dismiss"
            onClick={handleDismiss}
            size="icon-sm"
            variant="ghost"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dismiss</TooltipContent>
      </Tooltip>
    </div>
  );
}
