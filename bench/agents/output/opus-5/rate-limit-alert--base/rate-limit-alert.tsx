"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { WarningIcon } from "./icons";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function formatCountdown(seconds: number) {
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = Math.floor(
      (seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
    );

    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

type RateLimitAlertProps = {
  /** When the user is allowed to send another message. */
  retryAt?: Date;
  /** Overrides the default explanation copy. */
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
};

export function RateLimitAlert({
  retryAt,
  message = "You've sent too many messages in a short period of time.",
  onRetry,
  isRetrying = false,
  className,
}: RateLimitAlertProps) {
  const retryAtMs = retryAt ? retryAt.getTime() : null;

  // Resolved after mount so the countdown never renders a stale server value.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (retryAtMs === null) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((retryAtMs - Date.now()) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [retryAtMs]);

  const isWaiting = secondsLeft !== null && secondsLeft > 0;

  return (
    <div
      className={cn(
        "flex w-full flex-row items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-destructive text-sm",
        className
      )}
      data-testid="rate-limit-alert"
      role="alert"
    >
      <div className="mt-0.5 shrink-0">
        <WarningIcon size={16} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">Rate limit reached</p>
        <p className="text-destructive/80">{message}</p>
        {secondsLeft === null ? null : (
          <p
            aria-live="polite"
            className="text-destructive/80 tabular-nums"
            data-testid="rate-limit-alert-retry-time"
          >
            {isWaiting
              ? `You can try again in ${formatCountdown(secondsLeft)}.`
              : "You can try again now."}
          </p>
        )}
      </div>

      <Button
        className="shrink-0"
        data-testid="rate-limit-alert-retry"
        disabled={isWaiting || isRetrying}
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        {isRetrying ? <Spinner /> : null}
        Try again
      </Button>
    </div>
  );
}
