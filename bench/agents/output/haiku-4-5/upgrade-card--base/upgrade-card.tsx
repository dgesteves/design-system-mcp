"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircleFillIcon } from "./icons";

const features = [
  "Advanced AI capabilities",
  "Priority support",
  "Custom model fine-tuning",
  "Analytics dashboard",
];

export function UpgradeCard() {
  return (
    <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Pro Plan</h3>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-foreground">$99</span>
            <span className="text-muted-foreground">/month</span>
          </div>
        </div>
        <Badge variant="default" className="h-fit whitespace-nowrap">
          Most popular
        </Badge>
      </div>

      <div className="mb-8 space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-3">
            <CheckCircleFillIcon size={20} className="text-primary flex-shrink-0" />
            <span className="text-sm text-foreground">{feature}</span>
          </div>
        ))}
      </div>

      <Button className="w-full" size="lg">
        Upgrade to Pro
      </Button>
    </div>
  );
}
