// What a coding agent wrote before it could see the design system.
// `pnpm demo:check` (or the check_ui tool) reports every problem below.
import { Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <Card className="border-[#ef4444] p-[13px]">
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <Card.Description>This cannot be undone.</Card.Description>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Badge tone="warning">Irreversible</Badge>
        <Button variant="danger" onClick={onDelete}>
          Delete workspace
        </Button>
        <Button variant="ghost" size="icon">
          <Trash2 />
        </Button>
        <button className="rounded-[7px] bg-gray-100 px-3 text-sm">
          Cancel
        </button>
        <p style={{ color: "#737373", marginTop: 6 }}>Owners only.</p>
      </CardContent>
    </Card>
  )
}
