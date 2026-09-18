import { useState } from "react";
import { useRole } from "@/hooks/use-role";
import { useResetModuleData } from "@/hooks/useDataReset";
import { ResettableModule } from "@/services/dataManagementService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface ResetModuleButtonProps {
  module: ResettableModule;
  moduleLabel: string;
  className?: string;
  variant?: "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ResetModuleButton({
  module,
  moduleLabel,
  className = "",
  variant = "outline",
  size = "sm",
}: ResetModuleButtonProps) {
  const { isOwner, isSuperAdmin } = useRole();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const resetMutation = useResetModuleData();

  if (!isOwner && !isSuperAdmin) {
    return null;
  }

  const handleConfirmReset = () => {
    if (confirmText.trim().toUpperCase() !== "RESET") return;
    resetMutation.mutate(module, {
      onSuccess: () => {
        setOpen(false);
        setConfirmText("");
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) setConfirmText("");
    }}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={`gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 ${className}`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset {moduleLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive font-serif text-lg font-bold">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Reset {moduleLabel} Data
          </div>
          <AlertDialogDescription className="space-y-3 pt-2 text-left">
            <p className="text-sm text-foreground">
              This action will <strong>permanently delete all {moduleLabel.toLowerCase()} records</strong> for your organization.
            </p>
            <p className="text-xs text-muted-foreground bg-destructive/5 p-3 rounded-lg border border-destructive/20">
              ⚠️ <strong>Warning:</strong> This cannot be undone. Downstream records dependent on this data will be removed.
            </p>
            <div className="space-y-1 pt-2">
              <label className="text-xs font-medium text-foreground">
                Type <strong className="text-destructive font-mono">RESET</strong> to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type RESET"
                className="font-mono text-sm uppercase"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={confirmText.trim().toUpperCase() !== "RESET" || resetMutation.isPending}
            onClick={handleConfirmReset}
            className="gap-2"
          >
            {resetMutation.isPending ? "Resetting..." : `Confirm Reset`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
