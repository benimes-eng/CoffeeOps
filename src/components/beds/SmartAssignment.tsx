import { useState, useMemo } from "react";
import { X, ArrowRight, CheckCircle, AlertTriangle } from "lucide-react";
import { type BedWithAssignment, useLots, useBedsWithAssignments, useAssignLotToBed } from "@/hooks/use-beds";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";

interface Props {
  density: number;
  onClose: () => void;
}

export function SmartAssignment({ density, onClose }: Props) {
  const { toast } = useToast();
  const { data: lots } = useLots();
  const { data: beds } = useBedsWithAssignments();
  const assignMutation = useAssignLotToBed();

  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [weight, setWeight] = useState<number>(0);
  const [selectedBeds, setSelectedBeds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(1);

  const availableLots = lots?.filter((l) => l.status === "received" || l.status === "drying") ?? [];
  const selectedLot = availableLots.find((l) => l.id === selectedLotId);

  const requiredArea = weight > 0 ? Math.ceil(weight / density) : 0;

  const emptyBeds = useMemo(() => {
    return (beds ?? []).filter((b) => b.status === "empty").sort((a, b) => {
      const aArea = a.surface_area ?? 0;
      const bArea = b.surface_area ?? 0;
      return bArea - aArea; // largest first
    });
  }, [beds]);

  const totalSelectedArea = useMemo(() => {
    return emptyBeds.filter((b) => selectedBeds.has(b.id)).reduce((sum, b) => sum + (b.surface_area ?? 0), 0);
  }, [selectedBeds, emptyBeds]);

  const totalSelectedCapacity = totalSelectedArea * density;
  const fitPercentage = weight > 0 ? Math.round((totalSelectedCapacity / weight) * 100) : 0;

  // Auto-suggest beds
  const suggestedBeds = useMemo(() => {
    if (requiredArea <= 0) return [];
    let accumulated = 0;
    const suggested: string[] = [];
    for (const bed of emptyBeds) {
      if (accumulated >= requiredArea) break;
      suggested.push(bed.id);
      accumulated += bed.surface_area ?? 0;
    }
    return suggested;
  }, [emptyBeds, requiredArea]);

  const handleUseSuggestion = () => {
    setSelectedBeds(new Set(suggestedBeds));
  };

  const toggleBed = (bedId: string) => {
    setSelectedBeds((prev) => {
      const next = new Set(prev);
      if (next.has(bedId)) next.delete(bedId);
      else next.add(bedId);
      return next;
    });
  };

  const handleAssign = async () => {
    if (!selectedLotId || selectedBeds.size === 0 || weight <= 0) return;
    const bedArray = Array.from(selectedBeds);
    const weightPerBed = Math.round(weight / bedArray.length);
    const expectedCompletion = format(addDays(new Date(), 14), "yyyy-MM-dd");

    try {
      for (const bedId of bedArray) {
        const bed = emptyBeds.find((b) => b.id === bedId);
        await assignMutation.mutateAsync({
          bedId,
          lotId: selectedLotId,
          weight: weightPerBed,
          density,
          area: bed?.surface_area ?? 0,
          expectedCompletion,
        });
      }
      toast({ title: "Assignment complete", description: `${bedArray.length} beds assigned with ${weight} KG total` });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/20" />
      <div className="relative bg-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto card-shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border p-5 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="font-serif text-xl">Smart Bed Assignment</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Step 1: Select Lot & Weight */}
          <section>
            <StepHeader num={1} title="Select Lot & Weight" active={step >= 1} />
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Lot</label>
                <select
                  value={selectedLotId}
                  onChange={(e) => {
                    setSelectedLotId(e.target.value);
                    const lot = availableLots.find((l) => l.id === e.target.value);
                    if (lot) setWeight(lot.current_weight);
                    setStep(2);
                  }}
                  className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a lot...</option>
                  {availableLots.map((l) => (
                    <option key={l.id} value={l.id}>{l.lot_number} — {l.region} ({l.current_weight} KG)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Weight (KG)</label>
                <input
                  type="number"
                  value={weight || ""}
                  onChange={(e) => { setWeight(Number(e.target.value)); if (Number(e.target.value) > 0) setStep(2); }}
                  className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter weight..."
                />
              </div>
            </div>
          </section>

          {/* Step 2: Required Area Calculation */}
          {step >= 2 && weight > 0 && (
            <section>
              <StepHeader num={2} title="Required Surface Area" active />
              <div className="bg-muted/50 rounded-xl p-4 mt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">At {density} KG/m² density</p>
                  <p className="text-2xl font-serif">{requiredArea} m²</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Available empty beds</p>
                  <p className="text-2xl font-serif">{emptyBeds.length}</p>
                </div>
              </div>
            </section>
          )}

          {/* Step 3: Bed Selection */}
          {step >= 2 && weight > 0 && (
            <section>
              <StepHeader num={3} title="Select Beds" active />
              <div className="flex items-center justify-between mt-3 mb-3">
                <p className="text-sm text-muted-foreground">
                  {suggestedBeds.length} beds recommended
                </p>
                <button
                  onClick={handleUseSuggestion}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Use Suggestion
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {emptyBeds.map((bed) => {
                  const isSelected = selectedBeds.has(bed.id);
                  const isSuggested = suggestedBeds.includes(bed.id);
                  return (
                    <button
                      key={bed.id}
                      onClick={() => toggleBed(bed.id)}
                      className={`p-3 rounded-lg border text-left transition-all text-sm ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : isSuggested
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-mono font-bold text-xs">{bed.bed_number}</p>
                      <p className="text-[10px] text-muted-foreground">{bed.surface_area} m²</p>
                      <p className="text-[10px] text-muted-foreground">{(bed.surface_area ?? 0) * density} KG</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Step 4: Fit Summary */}
          {selectedBeds.size > 0 && (
            <section>
              <StepHeader num={4} title="Capacity Fit" active />
              <div className="bg-muted/50 rounded-xl p-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Capacity fit</span>
                  <span className={`text-sm font-bold ${fitPercentage >= 100 ? "text-success" : fitPercentage >= 80 ? "text-warning" : "text-destructive"}`}>
                    {fitPercentage}%
                  </span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${fitPercentage >= 100 ? "bg-success" : fitPercentage >= 80 ? "bg-warning" : "bg-destructive"}`}
                    style={{ width: `${Math.min(fitPercentage, 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground">
                  <div>Beds: <span className="font-medium text-foreground">{selectedBeds.size}</span></div>
                  <div>Area: <span className="font-medium text-foreground">{totalSelectedArea} m²</span></div>
                  <div>Cap: <span className="font-medium text-foreground">{totalSelectedCapacity} KG</span></div>
                </div>
                {totalSelectedCapacity < weight && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-destructive">
                    <AlertTriangle className="w-3 h-3" />
                    Insufficient capacity. Select more beds.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Step 5: Confirm */}
          {selectedBeds.size > 0 && totalSelectedCapacity >= weight && (
            <section>
              <StepHeader num={5} title="Confirm Assignment" active />
              <div className="mt-3 bg-success/10 border border-success/20 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Ready to assign {weight} KG across {selectedBeds.size} beds</p>
                  <p className="text-muted-foreground">Each bed will receive ~{Math.round(weight / selectedBeds.size)} KG</p>
                </div>
              </div>
              <button
                onClick={handleAssign}
                disabled={assignMutation.isPending}
                className="w-full mt-3 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {assignMutation.isPending ? "Assigning..." : "Confirm Assignment"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ num, title, active }: { num: number; title: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {num}
      </div>
      <h3 className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{title}</h3>
    </div>
  );
}
