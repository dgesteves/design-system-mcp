"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const PRO_FEATURES = [
  "Unlimited messages and chats",
  "Access to the most capable models",
  "Artifacts, code execution and file uploads",
  "Priority support and early features",
];

type UpgradeCardProps = {
  className?: string;
  price?: string;
  interval?: string;
  onUpgrade?: () => void;
};

export const UpgradeCard = ({
  className,
  price = "$20",
  interval = "month",
  onUpgrade,
}: UpgradeCardProps) => (
  <div
    className={cn(
      "flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border/50 bg-card p-5 shadow-[var(--shadow-card)]",
      className
    )}
    data-testid="upgrade-card"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-base text-foreground">Pro</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Everything you need for daily work.
        </p>
      </div>
      <Badge variant="secondary">Most popular</Badge>
    </div>

    <div className="flex items-baseline gap-1.5">
      <span className="font-semibold text-3xl text-foreground tabular-nums tracking-tight">
        {price}
      </span>
      <span className="text-muted-foreground text-sm">/{interval}</span>
    </div>

    <ul className="flex flex-col gap-2.5">
      {PRO_FEATURES.map((feature) => (
        <li className="flex items-start gap-2.5" key={feature}>
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon className="size-3" />
          </span>
          <span className="text-foreground text-[13px] leading-relaxed">
            {feature}
          </span>
        </li>
      ))}
    </ul>

    <Button className="w-full" onClick={onUpgrade} size="lg" type="button">
      Upgrade to Pro
    </Button>
  </div>
);
