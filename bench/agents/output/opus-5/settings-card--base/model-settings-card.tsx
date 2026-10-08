"use client";

import { useCallback, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ModelSettingsCard({
  className,
  defaultApiKey = "",
  description = "Bring your own key to use this provider. It is stored on your account and never shared.",
  isConnected = true,
  onSave,
  title = "Model provider",
}: {
  className?: string;
  defaultApiKey?: string;
  description?: string;
  isConnected?: boolean;
  onSave?: (apiKey: string) => void;
  title?: string;
}) {
  const apiKeyId = useId();
  const [apiKey, setApiKey] = useState(defaultApiKey);

  const handleSave = useCallback(() => {
    onSave?.(apiKey.trim());
  }, [apiKey, onSave]);

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border/50 bg-card p-5 shadow-[var(--shadow-card)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-foreground text-sm">{title}</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>

        {isConnected ? (
          <Badge
            className="shrink-0 gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            variant="secondary"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-emerald-500"
            />
            Connected
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-muted-foreground"
          htmlFor={apiKeyId}
        >
          API key
        </Label>

        <div className="flex items-center gap-2">
          <Input
            autoComplete="off"
            className="flex-1 font-mono text-xs md:text-xs"
            id={apiKeyId}
            name="apiKey"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            spellCheck={false}
            type="text"
            value={apiKey}
          />

          <Button onClick={handleSave} type="button">
            Save
          </Button>
        </div>
      </div>
    </section>
  );
}
