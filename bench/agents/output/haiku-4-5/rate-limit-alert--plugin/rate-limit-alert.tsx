"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "./icons";

type RateLimitAlertProps = {
  retryAfter: Date;
  onRetry: () => void;
  className?: string;
};

export function RateLimitAlert({
  retryAfter,
  onRetry,
  className,
}: RateLimitAlertProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const diff = retryAfter.getTime() - now.getTime();

      if (diff <= 0) {
        setCanRetry(true);
        setTimeLeft("");
        return;
      }

      setCanRetry(false);
      const seconds = Math.ceil(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      if (minutes > 0) {
        setTimeLeft(`${minutes}m ${remainingSeconds}s`);
      } else {
        setTimeLeft(`${remainingSeconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3",
        className
      )}
    >
      <WarningIcon className="h-5 w-5 text-destructive shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">
          You've been rate limited
        </p>
        <p className="text-xs text-destructive/70 mt-1">
          {canRetry
            ? "You can try again now"
            : `Try again in ${timeLeft || "..."}` }
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={!canRetry}
        className="shrink-0"
      >
        Try again
      </Button>
    </div>
  );
}
