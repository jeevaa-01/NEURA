import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CreateWorkspaceButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  function openDialog() {
    window.dispatchEvent(new Event("neura:create-workspace"));
  }

  return (
    <Button
      variant={compact ? "ghost" : "secondary"}
      onClick={openDialog}
      className={compact ? "w-full justify-start" : "w-full justify-between"}
    >
      <span className="flex items-center gap-2">
        <Plus aria-hidden className="size-4" />
        {compact ? "Create workspace" : "New workspace"}
      </span>
      {!compact && <span className="text-xs text-text-muted">Create</span>}
    </Button>
  );
}
