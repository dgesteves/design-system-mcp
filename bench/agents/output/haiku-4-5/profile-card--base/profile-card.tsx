"use client";

import { signOut } from "next-auth/react";
import type { User } from "next-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function emailToHue(email: string): number {
  let hash = 0;
  for (const char of email) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ProfileCard({ user }: { user: User }) {
  const initials = getInitials(user.name || user.email || "U");
  const hue = emailToHue(user.email || "");

  const handleSignOut = async () => {
    await signOut({ redirectTo: "/" });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className="mt-1 size-10 shrink-0 rounded-full ring-1 ring-border/50 flex items-center justify-center font-medium text-sm text-card-foreground"
          style={{
            background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${hue + 40}))`,
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {user.name || "User"}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {user.email}
          </p>
        </div>
      </div>

      <Badge variant="secondary" className="w-fit text-xs">
        Free plan
      </Badge>

      <Button
        onClick={handleSignOut}
        variant="outline"
        size="sm"
        className="w-full"
      >
        Sign out
      </Button>
    </div>
  );
}
