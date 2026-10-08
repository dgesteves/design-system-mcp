'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function UsageBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-destructive/10 px-4 py-3 text-destructive">
      <p className="text-sm font-medium">
        You've used 90% of your messages this month
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="bg-destructive text-primary-foreground hover:bg-destructive/90"
        >
          Upgrade
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss usage banner"
          className="text-destructive hover:bg-destructive/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
