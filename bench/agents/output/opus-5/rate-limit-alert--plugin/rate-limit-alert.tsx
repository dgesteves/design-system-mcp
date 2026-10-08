"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const secondsUntil = (timestamp: number) =>
  Math.max(0, Math.ceil((timestamp - Date.now()) / MS_PER_SECOND));

const formatWait = (totalSeconds: number) => {
  if (totalSeconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.round(
      (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
    );

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (totalSeconds >= SECONDS_PER_MINUTE) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${totalSeconds}s`;
};

type RateLimitAlertProps = {
  /** When the user is allowed to send another message. */
  retryAt: Date | string | number;
  onRetry: () => void;
  className?: string;
};

export const RateLimitAlert = ({
  retryAt,
  onRetry,
  className,
}: RateLimitAlertProps) => {
  const retryAtMs = new Date(retryAt).getTime();
  const hasRetryAt = Number.isFinite(retryAtMs);

  // Resolved on mount so the server and the client render the same markup.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!hasRetryAt) {
      setSecondsLeft(0);
      return;
    }

    setSecondsLeft(secondsUntil(retryAtMs));

    const interval = setInterval(() => {
      const remaining = secondsUntil(retryAtMs);
      setSecondsLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, MS_PER_SECOND);

    return () => clearInterval(interval);
  }, [hasRetryAt, retryAtMs]);

  const canRetry = secondsLeft === 0;

  let waitLabel = "You can try again shortly.";

  if (canRetry) {
    waitLabel = "You can try again now.";
  } else if (secondsLeft !== null) {
    waitLabel = `You can try again in ${formatWait(secondsLeft)}.`;
  }

  return (
    <div
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive",
        className
      )}
      role="alert"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">Rate limit reached</p>
          <p className="text-sm text-destructive/80">
            You&apos;ve reached the message limit.{" "}
            {/* Ticking text is kept out of the alert's live announcements. */}
            <span aria-live="off">{waitLabel}</span>
          </p>
        </div>

        <Button
          disabled={!canRetry}
          onClick={onRetry}
          size="sm"
          type="button"
          variant="destructive"
        >
          <RotateCwIcon />
          Try again
        </Button>
      </div>
    </div>
  );
};
