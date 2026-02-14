import { BedWithDetails, getBedStatusColor, getDryingDays, getDryingPhase } from "@/services/bedService";
import { useBedActivityLogs, useBedActions } from "@/hooks/useBedManagement";
import { X, RotateCcw, Sparkles, CloudRain, CheckCircle2, AlertTriangle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

const phaseLabels: Record<string, string> = {
  critical: "Critical (0-3 days)",
  active: "Active Drying",
  ready: "Ready / Finished",
};

const statusBadge: Record<string, string> = {
  red: "bg-status-red text-white",
  yellow: "bg-status-yellow text-foreground",
  green: "bg-status-green text-white",
  grey: "bg-status-grey text-white",
  black: "bg-status-black text-white",
};

interface Props {
  bed: BedWithDetails | null;
  open: boolean;
  onClose: () => void;
}

export function BedDetailPanel({ bed, open, onClose }: Props) {
  const { data: logs } = useBedActivityLogs(bed?.id);
  const { logAction, finish, maintenance, removeMaint } = useBedActions();
  const [maintenanceDesc, setMaintenanceDesc] = useState("");
  const [showMaintInput, setShowMaintInput] = useState(false);

  if (!bed) return null;

  const color = getBedStatusColor(bed);
  const area = bed.surface_area ?? Number(bed.length) * Number(bed.width);
  const days = bed.active_assignment ? getDryingDays(bed.active_assignment.assigned_date) : null;
  const phase = days !== null ? getDryingPhase(days) : null;
  const assignment = bed.active_assignment;
  const lot = assignment?.lot;

  const quickAction = (actionType: string, desc: string) => {
    logAction.mutate({ bedId: bed.id, actionType, description: desc, assignmentId: assignment?.id });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl flex items-center gap-3">
            Bed {bed.bed_number}
            <span className={`status-badge ${statusBadge[color]}`}>
              {bed.status === "maintenance" ? "Maintenance" : phase ? phaseLabels[phase] : "Empty"}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Bed Info */}
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Bed Information</h4>
            <div className="space-y-2">
              <Row label="Block" value={bed.block?.name || "—"} />
              <Row label="Site" value={bed.block?.site?.name || "—"} />
              <Row label="Dimensions" value={`${Number(bed.length)} × ${Number(bed.width)} m`} />
              <Row label="Surface Area" value={`${area} m²`} />
              <Row label="Material" value={bed.material_type || "—"} />
            </div>
          </section>

          {/* Current Lot */}
          {lot && assignment && (
            <>
              <Separator />
              <section>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Current Lot</h4>
                <div className="space-y-2">
                  <Row label="Lot Number" value={lot.lot_number} />
                  <Row label="Region" value={lot.region} />
                  <Row label="Intake Date" value={format(new Date(lot.intake_date), "MMM dd, yyyy")} />
                  <Row label="Assigned Weight" value={`${Number(assignment.assigned_weight)} KG`} />
                  <Row label="Drying Days" value={`${days}`} />
                  <Row label="Phase" value={phase ? phaseLabels[phase] : "—"} />
                  {assignment.expected_completion && (
                    <Row label="Expected Completion" value={format(new Date(assignment.expected_completion), "MMM dd, yyyy")} />
                  )}
                </div>
              </section>
            </>
          )}

          {/* Quick Actions */}
          <Separator />
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              {bed.status === "occupied" && (
                <>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => quickAction("turning", "Turning performed")}>
                    <RotateCcw className="w-4 h-4" /> Log Turning
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => quickAction("cleaning", "Cleaning/sorting performed")}>
                    <Sparkles className="w-4 h-4" /> Log Cleaning
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => quickAction("rain_cover", "Rain cover deployed")}>
                    <CloudRain className="w-4 h-4" /> Rain Cover
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2 text-success" onClick={() => {
                    if (assignment) finish.mutate({ bedId: bed.id, assignmentId: assignment.id });
                  }}>
                    <CheckCircle2 className="w-4 h-4" /> Mark Finished
                  </Button>
                </>
              )}
              {bed.status !== "maintenance" && (
                <Button variant="outline" size="sm" className="justify-start gap-2 text-destructive" onClick={() => setShowMaintInput(true)}>
                  <AlertTriangle className="w-4 h-4" /> Flag Maintenance
                </Button>
              )}
              {bed.status === "maintenance" && (
                <Button variant="outline" size="sm" className="justify-start gap-2 text-success" onClick={() => removeMaint.mutate({ bedId: bed.id })}>
                  <Wrench className="w-4 h-4" /> Remove Maintenance
                </Button>
              )}
            </div>

            {showMaintInput && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Issue description..."
                  value={maintenanceDesc}
                  onChange={(e) => setMaintenanceDesc(e.target.value)}
                  className="text-sm"
                />
                <Button size="sm" disabled={!maintenanceDesc.trim()} onClick={() => {
                  maintenance.mutate({ bedId: bed.id, description: maintenanceDesc });
                  setMaintenanceDesc("");
                  setShowMaintInput(false);
                }}>
                  Confirm
                </Button>
              </div>
            )}
          </section>

          {/* Activity Timeline */}
          <Separator />
          <section>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Activity Timeline</h4>
            {logs && logs.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium capitalize">{log.action_type.replace(/_/g, " ")}</p>
                      {log.description && <p className="text-muted-foreground text-xs">{log.description}</p>}
                      <p className="text-muted-foreground text-xs">{format(new Date(log.created_at), "MMM dd, yyyy HH:mm")}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/30">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
