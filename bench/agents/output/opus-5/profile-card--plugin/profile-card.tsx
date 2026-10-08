"use client";

import type { User } from "next-auth";
import { signOut } from "next-auth/react";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AVATAR_TINTS = [
  "bg-chart-1/20",
  "bg-chart-2/20",
  "bg-chart-3/20",
  "bg-chart-4/20",
  "bg-chart-5/20",
];

function tintForKey(key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function initialsFor(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0]?.trim() || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function ProfileCard({
  user,
  className,
}: {
  user: User;
  className?: string;
}) {
  const name = user.name ?? "";
  const email = user.email ?? "";

  const handleSignOut = useCallback(() => {
    signOut({ redirectTo: "/" });
  }, []);

  return (
    <div
      className={cn(
        "flex w-full max-w-xs flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 text-card-foreground shadow-[var(--shadow-card)]",
        className
      )}
      data-testid="profile-card"
    >
      <div className="flex flex-row items-center gap-3">
        <div
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-sm ring-1 ring-border/50",
            tintForKey(email || name)
          )}
        >
          {initialsFor(name, email)}
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-sm">
            {name || "Anonymous"}
          </span>
          <span
            className="truncate text-muted-foreground text-xs"
            data-testid="profile-card-email"
          >
            {email}
          </span>
        </div>
      </div>

      <div className="flex flex-row items-center justify-between gap-2">
        <Badge variant="secondary">Free plan</Badge>

        <Button
          data-testid="profile-card-sign-out"
          onClick={handleSignOut}
          size="sm"
          variant="destructive"
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
