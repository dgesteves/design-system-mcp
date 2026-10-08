'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const features = [
  'Unlimited conversations',
  'Priority support',
  'Advanced analytics',
  'Team collaboration',
];

export function UpgradeCard() {
  return (
    <div className="relative flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-card-foreground">Pro Plan</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-card-foreground">$29</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </div>
        </div>
        <Badge variant="default">Most popular</Badge>
      </div>

      <div className="flex flex-col gap-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-3">
            <Check className="size-4 shrink-0 text-primary" />
            <span className="text-sm text-card-foreground">{feature}</span>
          </div>
        ))}
      </div>

      <Button className="w-full">Upgrade to Pro</Button>
    </div>
  );
}
