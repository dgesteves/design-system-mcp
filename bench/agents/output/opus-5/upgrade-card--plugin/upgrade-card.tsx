"use client";

import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PRO_FEATURES = [
  "Unlimited messages and chats",
  "Access to the latest frontier models",
  "Higher limits on artifacts and file uploads",
  "Priority support and early access to new features",
];

type UpgradeCardProps = {
  className?: string;
  features?: string[];
  onUpgrade?: () => void;
  period?: string;
  price?: string;
};

export function UpgradeCard({
  className,
  features = PRO_FEATURES,
  onUpgrade,
  period = "month",
  price = "$20",
}: UpgradeCardProps) {
  return (
    <section
      className={cn(
        "flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border/50 bg-card p-6 shadow-[var(--shadow-card)]",
        className
      )}
      data-testid="upgrade-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-base text-foreground">Pro</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Everything you need for serious work.
          </p>
        </div>
        <Badge variant="secondary">Most popular</Badge>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-3xl text-foreground tracking-tight">
          {price}
        </span>
        <span className="text-muted-foreground text-sm">/{period}</span>
      </div>

      <Separator />

      <ul className="flex flex-col gap-3">
        {features.map((feature) => (
          <li className="flex items-start gap-2.5" key={feature}>
            <CheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <span className="text-foreground text-sm leading-snug">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <Button className="w-full" onClick={onUpgrade} size="lg">
        Upgrade to Pro
      </Button>
    </section>
  );
}
