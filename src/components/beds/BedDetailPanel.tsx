import { BedWithDetails, getBedStatusColor, getDryingDays, getDryingPhase } from "@/services/bedService";
import { useBedActivityLogs, useBedActions, useLots } from "@/hooks/useBedManagement";
import { RotateCcw, Sparkles, CloudRain, CheckCircle2, AlertTriangle, Wrench, Plus, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  density?: number;
}

export function BedDetailPanel({ bed, open, onClose, density = 30 }: Props) {
  const { data: logs } = useBedActivityLogs(bed?.id);
  const { data: lots } = useLots();
  const { logAction, finish, maintenance, removeMaint, assign } = useBedActions();
  const [maintenanceDesc, setMaintenanceDesc] = useState("");
  const [showMaintInput, setShowMaintInput] = useState(false);
  const [showQuickAssign, setShowQuickAssign] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [assignWeight, setAssignWeight] = useState("");
  // Completion flow
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [finalWeight, setFinalWeight] = useState("");
  const [moistureValue, setMoistureValue] = useState("");
  const [showMoistureInput, setShowMoistureInput] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  if (!bed) return null;

  const color = getBedStatusColor(bed);
  const area = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
  const days = bed.active_assignment ? getDryingDays(bed.active_assignment.assigned_date) : null;
  const phase = days !== null ? getDryingPhase(days) : null;
  const assignment = bed.active_assignment;
  const lot = assignment?.lot;
  const bedCapacity = area * density;

  const availableLots = lots?.filter((l) => l.status === "received" || l.status === "drying") || [];

  const quickAction = (actionType: string, desc: string) => {
    logAction.mutate({ bedId: bed.id, actionType, description: desc, assignmentId: assignment?.id });
  };

  const handleQuickAssign = () => {
    const w = Number(assignWeight);
    if (!selectedLotId || !w || w <= 0) return;
    assign.mutate(
      { bedId: bed.id, lotId: selectedLotId, weight: w, density, area },
      { onSuccess: () => { setShowQuickAssign(false); setSelectedLotId(""); setAssignWeight(""); } }
    );
  };

  const handleFinish = async () => {
    if (!assignment) return;
    const fw = Number(finalWeight);
    if (!fw || fw <= 0) {
      toast({ title: "Validation Error", description: "Please enter a valid final dry weight (KG)", variant: "destructive" });
      return;
    }
    try {
      await finish.mutateAsync({ bedId: bed.id, assignmentId: assignment.id, finalWeight: fw });
      setShowFinishDialog(false);
      setFinalWeight("");
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : "Failed to finish drying";
      toast({ title: "Error", description: err, variant: "destructive" });
    }
  };

  const handleLogMoisture = () => {
    const mv = Number(moistureValue);
    if (!mv || mv < 5 || mv > 70) {
      toast({ title: "Invalid Moisture", description: "Please enter a valid moisture % (between 5% and 70%)", variant: "destructive" });
      return;
    }
    quickAction("moisture_reading", `Moisture test logged: ${mv}% (Target: 11.0%)`);
    setShowMoistureInput(false);
    setMoistureValue("");
    toast({ title: "Moisture Logged", description: `Recorded ${mv}% moisture for Bed ${bed.bed_number}` });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto border-l border-border bg-card">
          <SheetHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider">Washing Station Field Map</p>
                <SheetTitle className="font-sans font-bold text-xl flex items-center gap-2 mt-0.5">
                  Bed {bed.bed_number}
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold uppercase ${statusBadge[color]}`}>
                    {bed.status === "maintenance" ? "Maintenance" : phase ? phaseLabels[phase] : "Vacant"}
                  </span>
                </SheetTitle>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-5 space-y-6">
            {/* Bed Info */}
            <section className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-border/80">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Specifications</h4>
              <div className="space-y-1.5">
                <Row label="Block Assignment" value={bed.block?.name || "—"} />
                <Row label="Washing Site" value={bed.block?.site?.name || "—"} />
                <Row label="Dimensions" value={`${Number(bed.length)}m × ${Number(bed.width)}m (${area} m²)`} />
                <Row label="Optimal Bed Capacity" value={`${bedCapacity.toFixed(0)} KG (at ${density} KG/m²)`} />
                <Row label="Mesh / Bed Material" value={bed.material_type || "Standard Wire Mesh"} />
                <Row label="Operational Status" value={bed.status.toUpperCase()} />
              </div>
            </section>

            {/* Current Lot */}
            {lot && assignment && (
              <section className="border border-border/80 rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Current Parchment Lot</h4>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded font-semibold">
                    Day {days} / 14
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Row label="Lot Tracking ID" value={lot.lot_number} />
                  <Row label="Origin Region" value={lot.region} />
                  <Row label="Intake Date" value={format(new Date(assignment.assigned_date), "MMM dd, yyyy")} />
                  <Row label="Assigned Wet Weight" value={`${Number(assignment.assigned_weight).toLocaleString()} KG`} />
                  <Row label="Surface Loading" value={`${(Number(assignment.assigned_weight) / area).toFixed(1)} KG/m²`} />
                  <Row label="Drying Stage" value={phase ? phaseLabels[phase] : "Active"} />
                  {assignment.expected_completion && (
                    <Row label="Target Dry Completion" value={format(new Date(assignment.expected_completion), "MMM dd, yyyy")} />
                  )}
                </div>
              </section>
            )}

            {/* Quick Field Operations */}
            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Field Operations</h4>
              <div className="grid grid-cols-2 gap-2">
                {bed.status === "empty" && (
                  <Button variant="default" size="sm" className="justify-start gap-2 col-span-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium" onClick={() => setShowQuickAssign(!showQuickAssign)}>
                    <Plus className="w-4 h-4" /> Direct Lot Staging
                  </Button>
                )}
                {bed.status === "occupied" && (
                  <>
                    <Button variant="outline" size="sm" className="justify-start gap-2 font-medium hover:bg-slate-100" onClick={() => quickAction("turning", "Daily bed turning and aeration performed")}>
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" /> Log Turning
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2 font-medium hover:bg-slate-100" onClick={() => quickAction("cleaning", "Hand-sorting and defect picking performed")}>
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Log Hand Sorting
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2 font-medium hover:bg-slate-100" onClick={() => quickAction("rain_cover", "Rain canopy / night shade cover deployed")}>
                      <CloudRain className="w-3.5 h-3.5 text-indigo-600" /> Rain Cover / Shade
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2 font-medium hover:bg-slate-100" onClick={() => setShowMoistureInput(!showMoistureInput)}>
                      <Droplets className="w-3.5 h-3.5 text-cyan-600" /> Record Moisture %
                    </Button>
                    <Button variant="default" size="sm" className="justify-start gap-2 col-span-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium" onClick={() => setShowFinishDialog(true)}>
                      <CheckCircle2 className="w-4 h-4" /> Weigh Out to Warehouse
                    </Button>
                  </>
                )}
                {bed.status !== "maintenance" && (
                  <Button variant="outline" size="sm" className="justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowMaintInput(true)}>
                    <AlertTriangle className="w-3.5 h-3.5" /> Flag Maintenance
                  </Button>
                )}
                {bed.status === "maintenance" && (
                  <Button variant="outline" size="sm" className="justify-start gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => removeMaint.mutate({ bedId: bed.id })}>
                    <Wrench className="w-3.5 h-3.5" /> Restore to Vacant
                  </Button>
                )}
              </div>

              {/* Moisture Input Drawer */}
              {showMoistureInput && (
                <div className="mt-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 space-y-2">
                  <Label className="text-xs font-semibold text-blue-950 dark:text-blue-200">Current Moisture Reading (%)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 11.5"
                      value={moistureValue}
                      onChange={(e) => setMoistureValue(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Button size="sm" onClick={handleLogMoisture} className="bg-blue-600 hover:bg-blue-700 text-white">
                      Save
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Standard export parchment specification: 10.5% – 11.5%</p>
                </div>
              )}

              {/* Quick Assign Form */}
              {showQuickAssign && (
                <div className="mt-3 space-y-3 bg-muted rounded-lg p-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Lot</Label>
                    <Select value={selectedLotId} onValueChange={setSelectedLotId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select lot" /></SelectTrigger>
                      <SelectContent>
                        {availableLots.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.lot_number} — {l.region} ({Number(l.current_weight)} KG)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Weight (KG) — max {bedCapacity.toFixed(0)} KG</Label>
                    <Input type="number" placeholder="Weight to assign" value={assignWeight} onChange={(e) => setAssignWeight(e.target.value)} className="h-9 text-sm" max={bedCapacity} />
                  </div>
                  {Number(assignWeight) > bedCapacity && <p className="text-xs text-destructive">Exceeds bed capacity of {bedCapacity.toFixed(0)} KG</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowQuickAssign(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleQuickAssign} disabled={!selectedLotId || !Number(assignWeight) || Number(assignWeight) > bedCapacity || assign.isPending}>
                      {assign.isPending ? "Assigning..." : "Assign"}
                    </Button>
                  </div>
                </div>
              )}

              {showMaintInput && (
                <div className="mt-3 flex gap-2">
                  <Input placeholder="Issue description..." value={maintenanceDesc} onChange={(e) => setMaintenanceDesc(e.target.value)} className="text-sm" />
                  <Button size="sm" disabled={!maintenanceDesc.trim()} onClick={() => { maintenance.mutate({ bedId: bed.id, description: maintenanceDesc }); setMaintenanceDesc(""); setShowMaintInput(false); }}>Confirm</Button>
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

      {/* Finish/Complete Dialog */}
      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Complete Drying — Bed {bed.bed_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {lot && (
              <p className="text-sm text-muted-foreground">
                Lot: {lot.lot_number} • Initial: {Number(assignment?.assigned_weight)} KG • {days} days drying
              </p>
            )}
            <div className="space-y-2">
              <Label>Final Coffee Amount (KG)</Label>
              <Input type="number" placeholder="e.g. 380" value={finalWeight} onChange={(e) => setFinalWeight(e.target.value)} />
              <p className="text-xs text-muted-foreground">This weight will be used for grinding.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFinishDialog(false); setFinalWeight(""); }}>Cancel</Button>
            <Button onClick={handleFinish} disabled={!Number(finalWeight)}>
              Complete Drying
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
