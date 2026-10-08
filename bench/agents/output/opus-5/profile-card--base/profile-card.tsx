"use client";

import type { User } from "next-auth";
import { signOut } from "next-auth/react";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function emailToHue(email: string): number {
  let hash = 0;
  for (const char of email) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@").at(0)?.trim() || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

type ProfileCardProps = {
  user: User;
  className?: string;
};

export function ProfileCard({ user, className }: ProfileCardProps) {
  const email = user.email ?? "";
  const name = user.name?.trim() || email.split("@").at(0) || "Anonymous";
  const hue = emailToHue(email);

  const handleSignOut = useCallback(() => {
    signOut({
      redirectTo: "/",
    });
  }, []);

  return (
    <div
      className={cn(
        "flex w-full max-w-xs flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]",
        className
      )}
      data-testid="profile-card"
    >
      <div className="flex flex-row items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-[13px] ring-1 ring-border/50"
          style={{
            background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${hue + 40}))`,
            color: "oklch(0.985 0 0)",
          }}
        >
          {getInitials(user.name, email)}
        </div>
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate font-medium text-[13px] text-foreground"
            data-testid="profile-card-name"
          >
            {name}
          </span>
          <span
            className="truncate text-muted-foreground text-xs"
            data-testid="profile-card-email"
            title={email}
          >
            {email}
          </span>
        </div>
      </div>

      <Separator className="bg-border/60" />

      <div className="flex flex-row items-center justify-between gap-2">
        <Badge variant="secondary">Free plan</Badge>
        <Button onClick={handleSignOut} size="sm" type="button" variant="ghost">
          Sign out
        </Button>
      </div>
    </div>
  );
}
