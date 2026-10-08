"use client"

import { useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Badge } from "../ui/badge"

export function ModelSettingsCard({
  title = "Model Settings",
  description = "Configure your API key to connect to the model service",
  onSave,
  isConnected = false,
}: {
  title?: string
  description?: string
  onSave?: (apiKey: string) => void | Promise<void>
  isConnected?: boolean
}) {
  const [apiKey, setApiKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave?.(apiKey)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {isConnected && (
          <Badge variant="default" className="ml-4 shrink-0 bg-green-600 text-white hover:bg-green-700">
            Connected
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key" className="font-medium">
            API Key
          </Label>
          <Input
            id="api-key"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!apiKey.trim() || isSaving}
          className="w-full sm:w-auto"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
