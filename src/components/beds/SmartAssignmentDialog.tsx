import { useState } from "react";
import { useBeds, useLots, useBedActions } from "@/hooks/useBedManagement";
import { BedWithDetails, getBedStatusColor } from "@/services/bedService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  siteId?: string;
  density: number;
}

export function SmartAssignmentDialog({ open, onClose, siteId, density }: Props) {
  const { data: beds } = useBeds(siteId);
  const { data: lots } = useLots("received");
  const { assign } = useBedActions();
  const [selectedLotId, setSelectedLotId] = useState("");
  const [weight, setWeight] = useState("");
  const [selectedBeds, setSelectedBeds] = useState<string[]>([]);
  const [step, setStep] = useState(1);

  const lot = lots?.find((l) => l.id === selectedLotId);
  const weightNum = Number(weight) || 0;
  const requiredArea = weightNum / density;

  const emptyBeds = (beds || []).filter((b) => b.status === "empty").sort((a, b) => {
    const aArea = Number(a.surface_area ?? Number(a.length) * Number(a.width));
    const bArea = Number(b.surface_area ?? Number(b.length) * Number(b.width));
    return bArea - aArea;
  });

  const getCapacity = (bed: BedWithDetails) => {
    const area = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
    return area * density;
  };

  const totalSelectedArea = selectedBeds.reduce((sum, id) => {
    const bed = emptyBeds.find((b) => b.id === id);
    if (!bed) return sum;
    return sum + Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
  }, 0);

  const totalSelectedCapacity = totalSelectedArea * density;
  const fitPct = weightNum > 0 ? Math.min(100, Math.round((totalSelectedCapacity / weightNum) * 100)) : 0;

  const handleAssign = async () => {
    if (!selectedLotId || selectedBeds.length === 0) return;
    const perBedWeight = weightNum / selectedBeds.length;
    for (const bedId of selectedBeds) {
      const bed = emptyBeds.find((b) => b.id === bedId)!;
      const area = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
      await assign.mutateAsync({ bedId, lotId: selectedLotId, weight: perBedWeight, density, area });
    }
    handleClose();
  };

  const handleClose = () => {
    setSelectedLotId("");
    setWeight("");
    setSelectedBeds([]);
    setStep(1);
    onClose();
  };

  const toggleBed = (id: string) => {
    setSelectedBeds((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto bg-card border-border">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="font-sans font-bold text-lg text-foreground flex items-center justify-between">
            <span>Specialty Lot Staging & Bed Allocation</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border">
              Target: {density} KG/m²
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Step 1: Select lot & weight */}
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-border/80">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Step 1: Harvest Intake Lot</h4>
              <span className="text-[11px] text-muted-foreground">Select received wet cherry/parchment</span>
            </div>
            <Select value={selectedLotId} onValueChange={setSelectedLotId}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="Select incoming lot..." /></SelectTrigger>
              <SelectContent>
                {lots?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="font-semibold">{l.lot_number}</span> — {l.region} ({Number(l.current_weight).toLocaleString()} KG available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Weight to Stage onto Beds (KG)</label>
              <Input
                type="number"
                placeholder="e.g. 1200"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="bg-background font-mono"
              />
            </div>

            {weightNum > 0 && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60 text-muted-foreground font-mono">
                <span>Calculated Required Drying Surface Area:</span>
                <span className="font-bold text-foreground">{requiredArea.toFixed(1)} m²</span>
              </div>
            )}
          </div>

          {/* Step 2: Select beds */}
          {weightNum > 0 && selectedLotId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Step 2: Allocate Drying Beds ({emptyBeds.length} vacant in field)
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    // Auto-select contiguous beds until capacity is met
                    let cumArea = 0;
                    const autoSelected: string[] = [];
                    for (const b of emptyBeds) {
                      autoSelected.push(b.id);
                      cumArea += Number(b.surface_area ?? Number(b.length) * Number(b.width));
                      if (cumArea * density >= weightNum) break;
                    }
                    setSelectedBeds(autoSelected);
                  }}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  ⚡ Auto-Fit Optimal Beds
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto p-1">
                {emptyBeds.map((bed) => {
                  const cap = getCapacity(bed);
                  const isSelected = selectedBeds.includes(bed.id);
                  const bedArea = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
                  return (
                    <button
                      key={bed.id}
                      onClick={() => toggleBed(bed.id)}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600 font-semibold text-emerald-950 dark:text-emerald-200"
                          : "border-border hover:border-slate-400 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold">{bed.bed_number}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">{bedArea}m² • {cap.toFixed(0)}kg</p>
                    </button>
                  );
                })}
              </div>

              {/* Capacity fit indicator */}
              {selectedBeds.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-border/80 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground uppercase tracking-wider">Surface Loading Capacity</span>
                    <span className={fitPct >= 100 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-600"}>
                      {fitPct}% Covered ({totalSelectedCapacity.toFixed(0)} / {weightNum} KG)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${fitPct >= 100 ? "bg-emerald-600" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(fitPct, 100)}%` }}
                    />
                  </div>
                  {fitPct < 100 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> Additional beds needed for optimal single-layer drying aeration.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAssign}
            disabled={fitPct < 100 || selectedBeds.length === 0 || assign.isPending}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {assign.isPending ? "Assigning..." : "Confirm Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
