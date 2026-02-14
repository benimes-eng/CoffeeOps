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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Smart Bed Assignment</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1: Select lot & weight */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Step 1: Select Lot & Weight</h4>
            <Select value={selectedLotId} onValueChange={setSelectedLotId}>
              <SelectTrigger><SelectValue placeholder="Select a lot" /></SelectTrigger>
              <SelectContent>
                {lots?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lot_number} — {l.region} ({Number(l.current_weight)} KG remaining)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Weight to assign (KG)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            {weightNum > 0 && (
              <div className="text-sm text-muted-foreground">
                Required area: <span className="font-semibold text-foreground">{requiredArea.toFixed(1)} m²</span> at {density} KG/m²
              </div>
            )}
          </div>

          {/* Step 2: Select beds */}
          {weightNum > 0 && selectedLotId && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Step 2: Select Beds ({emptyBeds.length} available)</h4>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {emptyBeds.map((bed) => {
                  const cap = getCapacity(bed);
                  const isSelected = selectedBeds.includes(bed.id);
                  const bedArea = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));
                  return (
                    <button
                      key={bed.id}
                      onClick={() => toggleBed(bed.id)}
                      className={`p-2 rounded-lg border text-xs text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-semibold">{bed.bed_number}</p>
                      <p className="text-muted-foreground">{bedArea} m² • {cap.toFixed(0)} KG</p>
                    </button>
                  );
                })}
              </div>

              {/* Capacity fit indicator */}
              {selectedBeds.length > 0 && (
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Capacity Fit</span>
                    <span className={`font-semibold ${fitPct >= 100 ? "text-success" : "text-destructive"}`}>
                      {fitPct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${fitPct >= 100 ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${Math.min(fitPct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {totalSelectedCapacity.toFixed(0)} KG capacity across {selectedBeds.length} bed(s) for {weightNum} KG
                  </p>
                  {fitPct < 100 && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Insufficient capacity — select more beds
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
