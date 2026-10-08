"use client";

import { type ChangeEvent, useCallback, useId, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function ModelSettingsCard({
  title = "Model provider",
  description = "Add your own API key to send requests through your provider account.",
  defaultApiKey = "",
  isConnected = false,
  onSave,
}: {
  title?: string;
  description?: string;
  defaultApiKey?: string;
  isConnected?: boolean;
  onSave?: (apiKey: string) => void;
}) {
  const apiKeyId = useId();
  const [apiKey, setApiKey] = useState(defaultApiKey);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(apiKey);
  }, [apiKey, onSave]);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-foreground text-sm">{title}</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>

        {isConnected ? (
          <Badge className="gap-1.5 text-chart-2" variant="outline">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-chart-2" />
            Connected
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="font-normal text-muted-foreground" htmlFor={apiKeyId}>
          API key
        </Label>
        <Input
          autoComplete="off"
          id={apiKeyId}
          name="apiKey"
          onChange={handleChange}
          placeholder="sk-..."
          spellCheck={false}
          type="text"
          value={apiKey}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} size="sm" type="button">
          Save
        </Button>
      </div>
    </section>
  );
}
