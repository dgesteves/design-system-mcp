import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ProfileCardProps {
  name: string;
  email: string;
  onSignOut: () => void;
}

export function ProfileCard({ name, email, onSignOut }: ProfileCardProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = [
    "bg-chart-1",
    "bg-chart-2",
    "bg-chart-3",
    "bg-chart-4",
    "bg-chart-5",
  ];
  const colorIndex = email.charCodeAt(0) % colors.length;
  const avatarColor = colors[colorIndex];

  return (
    <div className="bg-card text-card-foreground rounded-lg border border-border p-4 w-64">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`${avatarColor} text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center font-semibold text-sm`}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="mb-4">
        <Badge variant="secondary">Free plan</Badge>
      </div>

      <Button
        onClick={onSignOut}
        variant="outline"
        size="sm"
        className="w-full"
      >
        Sign out
      </Button>
    </div>
  );
}
