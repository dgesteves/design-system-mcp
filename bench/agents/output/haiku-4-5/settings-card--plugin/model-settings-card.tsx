'use client';

import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function ModelSettingsCard() {
  const [apiKey, setApiKey] = useState('');

  const handleSave = () => {
    // Save logic would go here
    console.log('Saved API key:', apiKey);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-card-foreground mb-2">
            Model Settings
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure your API key to connect to the model service
          </p>
        </div>
        <Badge variant="default" className="whitespace-nowrap">
          Connected
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </Label>
          <Input
            id="api-key"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-10"
          />
        </div>

        <Button
          onClick={handleSave}
          variant="default"
          className="w-full"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
