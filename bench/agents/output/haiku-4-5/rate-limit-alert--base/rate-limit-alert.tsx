"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { WarningIcon } from "./icons";

type RateLimitAlertProps = {
  retryAt: Date | number;
  onRetry: () => void;
  className?: string;
};

export function RateLimitAlert({
  retryAt,
  onRetry,
  className,
}: RateLimitAlertProps) {
  const [retryTime, setRetryTime] = useState<string>("");
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    const updateRetryTime = () => {
      const now = new Date();
      const retryDate = retryAt instanceof Date ? retryAt : new Date(retryAt);
      const diffMs = retryDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setCanRetry(true);
        setRetryTime("now");
        return;
      }

      setCanRetry(false);
      const diffSeconds = Math.ceil(diffMs / 1000);
      const minutes = Math.floor(diffSeconds / 60);
      const seconds = diffSeconds % 60;

      if (minutes > 0) {
        setRetryTime(`${minutes}m ${seconds}s`);
      } else {
        setRetryTime(`${seconds}s`);
      }
    };

    updateRetryTime();
    const interval = setInterval(updateRetryTime, 1000);

    return () => clearInterval(interval);
  }, [retryAt]);

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-red-500/50 bg-red-50 p-3 dark:bg-red-950/30",
        className
      )}
    >
      <div className="flex shrink-0 items-start pt-0.5 text-red-600 dark:text-red-500">
        <WarningIcon size={16} />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Rate limited
        </p>
        <p className="text-xs text-red-600 dark:text-red-500">
          You can retry in {retryTime}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          size="sm"
          variant="destructive"
          onClick={onRetry}
          disabled={!canRetry}
          className="h-8 px-2 text-xs"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
