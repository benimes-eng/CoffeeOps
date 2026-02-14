import { useState } from "react";
import { X, RotateCcw, Sparkles, CloudRain, CheckCircle, Wrench, WrenchIcon, Clock } from "lucide-react";
import {
  type BedWithAssignment,
  type ActivityLog,
  getDryingColor,
  useBedActivityLogs,
  useLogBedAction,
  useMarkBedFinished,
  useToggleMaintenance,
} from "@/hooks/use-beds";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  bed: BedWithAssignment;
  onClose: () => void;
}

const actionLabels: Record<string, string> = {
  turning: "Turning",
  cleaning: "Cleaning / Sorting",
  rain_cover: "Rain Cover",
  inspection: "Inspection",
  assignment: "Assignment",
  removal: "Removal",
  finished: "Finished",
  maintenance_start: "Maintenance Start",
  maintenance_end: "Maintenance End",
  maintenance_flag: "Maintenance Flag",
};

const actionIcons: Record<string, string> = {
  turning: "🔄",
  cleaning: "🧹",
  rain_cover: "🌧️",
  assignment: "📥",
  finished: "✅",
  maintenance_start: "🔧",
  maintenance_end: "✅",
  inspection: "🔍",
};

export function BedDetailPanel({ bed, onClose }: Props) {
  const { toast } = useToast();
  const { data: logs, isLoading: logsLoading } = useBedActivityLogs(bed.id);
  const logAction = useLogBedAction();
  const markFinished = useMarkBedFinished();
  const toggleMaint = useToggleMaintenance();
  const [maintDesc, setMaintDesc] = useState("");
  const [showMaintInput, setShowMaintInput] = useState(false);

  const color = getDryingColor(bed.dryingPhase);
  const assignment = bed.activeAssignment;
  const lot = assignment?.lots;

  const handleQuickAction = (actionType: string, desc: string) => {
    logAction.mutate(
      { bedId: bed.id, assignmentId: assignment?.id, actionType, description: desc },
      {
        onSuccess: () => toast({ title: "Action logged", description: `${actionLabels[actionType]} recorded` }),
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleFinish = () => {
    if (!assignment) return;
    markFinished.mutate(
      { bedId: bed.id, assignmentId: assignment.id },
      {
        onSuccess: () => { toast({ title: "Bed cleared", description: "Drying marked as finished" }); onClose(); },
      }
    );
  };

  const handleMaintenance = () => {
    if (bed.status === "maintenance") {
      toggleMaint.mutate(
        { bedId: bed.id, toMaintenance: false },
        { onSuccess: () => { toast({ title: "Maintenance ended" }); onClose(); } }
      );
    } else if (showMaintInput) {
      if (!maintDesc.trim()) return;
      toggleMaint.mutate(
        { bedId: bed.id, toMaintenance: true, description: maintDesc },
        { onSuccess: () => { toast({ title: "Bed flagged for maintenance" }); onClose(); } }
      );
    } else {
      setShowMaintInput(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/20" />
      <div
        className="relative w-full max-w-lg bg-card h-full overflow-y-auto shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border z-10 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${color.bg} ${color.text} flex items-center justify-center text-xs font-bold`}>
              {bed.bed_number}
            </div>
            <div>
              <h2 className="font-serif text-xl">Bed {bed.bed_number}</h2>
              <p className="text-xs text-muted-foreground">{bed.blocks.sites.name} · {bed.blocks.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Bed Info */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bed Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="Dimensions" value={`${bed.length} × ${bed.width} m`} />
              <InfoItem label="Surface Area" value={`${bed.surface_area ?? 0} m²`} />
              <InfoItem label="Material" value={bed.material_type || "—"} />
              <InfoItem label="Status">
                <span className={`status-badge ${color.bg} ${color.text}`}>{color.label}</span>
              </InfoItem>
              {bed.dryingDays !== undefined && (
                <InfoItem label="Drying Days" value={`${bed.dryingDays} days`} />
              )}
              <InfoItem label="Capacity" value={`${(bed.surface_area ?? 0) * 30} KG @ 30 KG/m²`} />
            </div>
          </section>

          {/* Current Lot */}
          {lot && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Current Lot</h3>
              <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold font-mono">{lot.lot_number}</span>
                  <span className="status-badge bg-primary/10 text-primary">{lot.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Region:</span> {lot.region}</div>
                  <div><span className="text-muted-foreground">Intake:</span> {format(new Date(lot.intake_date), "MMM dd")}</div>
                  <div><span className="text-muted-foreground">Weight:</span> {assignment.assigned_weight} KG</div>
                  <div><span className="text-muted-foreground">Area:</span> {assignment.assigned_area ?? "—"} m²</div>
                  {assignment.expected_completion && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Est. Completion:</span>{" "}
                      {format(new Date(assignment.expected_completion), "MMM dd, yyyy")}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Quick Actions */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {assignment && bed.status === "occupied" && (
                <>
                  <ActionBtn icon={<RotateCcw className="w-4 h-4" />} label="Log Turning" onClick={() => handleQuickAction("turning", "Turning completed")} />
                  <ActionBtn icon={<Sparkles className="w-4 h-4" />} label="Log Cleaning" onClick={() => handleQuickAction("cleaning", "Cleaning/sorting completed")} />
                  <ActionBtn icon={<CloudRain className="w-4 h-4" />} label="Rain Cover" onClick={() => handleQuickAction("rain_cover", "Rain cover deployed")} />
                  <ActionBtn icon={<CheckCircle className="w-4 h-4" />} label="Mark Finished" variant="success" onClick={handleFinish} />
                </>
              )}
              <ActionBtn
                icon={bed.status === "maintenance" ? <WrenchIcon className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                label={bed.status === "maintenance" ? "End Maintenance" : "Flag Maintenance"}
                variant={bed.status === "maintenance" ? "success" : "destructive"}
                onClick={handleMaintenance}
                className="col-span-2"
              />
            </div>
            {showMaintInput && bed.status !== "maintenance" && (
              <div className="mt-3">
                <textarea
                  placeholder="Describe the maintenance issue..."
                  value={maintDesc}
                  onChange={(e) => setMaintDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleMaintenance}
                  disabled={!maintDesc.trim()}
                  className="mt-2 w-full py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Confirm Maintenance
                </button>
              </div>
            )}
          </section>

          {/* Activity Timeline */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity Timeline</h3>
            {logsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !logs?.length ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="space-y-0">
                {logs.map((log, i) => (
                  <div key={log.id} className="flex gap-3 pb-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs flex-shrink-0">
                        {actionIcons[log.action_type] || "📋"}
                      </div>
                      {i < logs.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-sm font-medium">{actionLabels[log.action_type] || log.action_type}</p>
                      {log.description && <p className="text-xs text-muted-foreground mt-0.5">{log.description}</p>}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "MMM dd, HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {children || <p className="text-sm font-medium mt-0.5">{value}</p>}
    </div>
  );
}

function ActionBtn({ icon, label, variant, onClick, className }: {
  icon: React.ReactNode; label: string; variant?: "success" | "destructive"; onClick: () => void; className?: string;
}) {
  const colors =
    variant === "success" ? "bg-success text-success-foreground" :
    variant === "destructive" ? "bg-destructive text-destructive-foreground" :
    "bg-muted text-foreground hover:bg-muted/80";
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${colors} ${className || ""}`}>
      {icon} {label}
    </button>
  );
}
