import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGrindingBatches, useStartGrinding, useCompleteGrinding, GrindingBatchWithLot } from "@/hooks/useGrinding";
import { useLots, LOTS_QUERY_KEY } from "@/hooks/useLots";
import { calculateYield, createDirectDriedLot } from "@/services/grindingService";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Coffee, CheckCircle2, Package, AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ETHIOPIAN_REGIONS = [
  "Yirgacheffe", "Sidama", "Guji", "Harrar", "Limu",
  "Kaffa", "Bench", "Dawro", "Shakiso", "Borena",
  "Gedeo", "Bale", "Jimma", "Nekemte", "Gimbi",
];

const statusBadge: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  grinding: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
};

const GrindingPage = () => {
  const [showComplete, setShowComplete] = useState<string | null>(null);
  const [groundWeight, setGroundWeight] = useState("");

  // --- Direct Dried Coffee Intake ---
  const [showDirectIntake, setShowDirectIntake] = useState(false);
  const [intakeRegion, setIntakeRegion] = useState("");
  const [intakeWeight, setIntakeWeight] = useState("");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [intakeLotNumber, setIntakeLotNumber] = useState("");

  const qc = useQueryClient();
  const { toast } = useToast();

  const addDirectDriedLot = useMutation({
    mutationFn: () =>
      createDirectDriedLot({
        region: intakeRegion,
        weight: Number(intakeWeight),
        notes: intakeNotes || undefined,
        lotNumber: intakeLotNumber || undefined,
      }),
    onSuccess: (data: { lot_number?: string } | null) => {
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      toast({
        title: "Purchased Dried Coffee Registered",
        description: `Lot ${data?.lot_number ?? ""} is ready for hulling.`,
      });
      setShowDirectIntake(false);
      setIntakeRegion("");
      setIntakeWeight("");
      setIntakeNotes("");
      setIntakeLotNumber("");
    },
    onError: (err: Error) => {
      toast({
        title: "Intake Failed",
        description: err.message || "Could not register dried coffee intake.",
        variant: "destructive",
      });
    },
  });

  const canSubmitIntake =
    intakeRegion.trim() !== "" &&
    Number(intakeWeight) > 0 &&
    !addDirectDriedLot.isPending;


  const { data: batches, isLoading } = useGrindingBatches();
  const { data: readyLots } = useLots("ready_for_grinding");
  const startGrinding = useStartGrinding();
  const completeGrinding = useCompleteGrinding();

  const pendingCount = (batches || []).filter((b: GrindingBatchWithLot) => b.status === "grinding").length;
  const completedCount = (batches || []).filter((b: GrindingBatchWithLot) => b.status === "completed").length;
  const selectedBatch = (batches || []).find((b: GrindingBatchWithLot) => b.id === showComplete);

  const dryWeight = selectedBatch ? Number(selectedBatch.dry_weight) : 0;
  const inputGroundWeight = Number(groundWeight) || 0;
  const isOverweight = inputGroundWeight > dryWeight;
  const { yieldPercent, lossKg } = calculateYield(inputGroundWeight, dryWeight);

  const handleComplete = () => {
    if (!selectedBatch || inputGroundWeight <= 0 || isOverweight) return;

    completeGrinding.mutate(
      {
        batchId: selectedBatch.id,
        lotId: selectedBatch.lot_id,
        groundWeight: inputGroundWeight,
        dryWeight,
      },
      {
        onSuccess: () => {
          setShowComplete(null);
          setGroundWeight("");
        },
      }
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Dry Milling & Grinding</h1>
          <p className="text-muted-foreground mt-1">
            Parchment hulling, clean green output verification, and yield calculations
          </p>
        </div>
        <Button
          onClick={() => setShowDirectIntake(true)}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Purchased Dried Coffee
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Ready for Hulling"
          value={readyLots?.length || 0}
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          title="Currently Hulling"
          value={pendingCount}
          icon={<Coffee className="w-4 h-4" />}
        />
        <MetricCard
          title="Milling Completed"
          value={completedCount}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      {/* Ready for Grinding Lots */}
      {readyLots && readyLots.length > 0 && (
        <div className="bg-card rounded-xl card-shadow border border-border/50 p-5">
          <h3 className="font-serif text-lg mb-3">Dry Parchment Lots Ready for Hulling</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {readyLots.map((lot) => (
              <div
                key={lot.id}
                className="flex items-center justify-between p-3.5 bg-muted/30 border border-border/50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-mono font-medium">{lot.lot_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {lot.region} • {Number(lot.current_weight).toLocaleString()} KG Parchment
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => startGrinding.mutate(lot.id)}
                  disabled={startGrinding.isPending}
                  className="gap-1.5"
                >
                  Start Hulling <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Lot #
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Region
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Input Dry (KG)
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Output Clean (KG)
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Milling Yield
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    Loading grinding batches...
                  </td>
                </tr>
              ) : batches && batches.length > 0 ? (
                batches.map((batch: GrindingBatchWithLot) => {
                  const inputWeight = Number(batch.dry_weight);
                  const outputWeight = batch.ground_weight ? Number(batch.ground_weight) : null;
                  const currentYield = outputWeight ? ((outputWeight / inputWeight) * 100).toFixed(1) : null;

                  return (
                    <tr
                      key={batch.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm font-mono font-medium">
                        {batch.lot?.lot_number || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm">{batch.lot?.region || "—"}</td>
                      <td className="px-5 py-3.5 text-sm">{inputWeight.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm font-medium">
                        {outputWeight !== null ? outputWeight.toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm">
                        {currentYield !== null ? (
                          <span className="font-semibold text-primary">{currentYield}%</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`status-badge capitalize ${
                            statusBadge[batch.status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {batch.status === "grinding" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowComplete(batch.id);
                              setGroundWeight("");
                            }}
                          >
                            Complete Milling
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No milling batches recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Grinding Dialog */}
      <Dialog
        open={!!showComplete}
        onOpenChange={(v) => {
          if (!v) {
            setShowComplete(null);
            setGroundWeight("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Complete Milling & Record Output</DialogTitle>
            <DialogDescription>
              Weigh the green clean exportable coffee. Output cannot exceed input dry parchment weight.
            </DialogDescription>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lot:</span>
                  <span className="font-mono font-medium">{selectedBatch.lot?.lot_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input Dry Parchment Weight:</span>
                  <span className="font-semibold">{dryWeight.toLocaleString()} KG</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Output Clean Green Coffee Weight (KG)</Label>
                <Input
                  type="number"
                  placeholder={`Maximum ${dryWeight} KG`}
                  value={groundWeight}
                  onChange={(e) => setGroundWeight(e.target.value)}
                />
              </div>

              {isOverweight && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Physical impossibility: Output clean coffee cannot exceed input dry parchment ({dryWeight} KG).
                </div>
              )}

              {inputGroundWeight > 0 && !isOverweight && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Calculated Milling Yield:</span>
                    <span className="font-bold text-sm text-primary">{yieldPercent}%</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Milling Loss (Husk & Defects):</span>
                    <span>{lossKg.toLocaleString()} KG</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowComplete(null);
                setGroundWeight("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={inputGroundWeight <= 0 || isOverweight || completeGrinding.isPending}
            >
              {completeGrinding.isPending ? "Completing..." : "Confirm & Ready for Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Dried Coffee Intake Dialog */}
      <Dialog
        open={showDirectIntake}
        onOpenChange={(v) => {
          if (!v) {
            setShowDirectIntake(false);
            setIntakeRegion("");
            setIntakeWeight("");
            setIntakeNotes("");
            setIntakeLotNumber("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Register Purchased Dried Coffee</DialogTitle>
            <DialogDescription>
              Log externally sourced dried parchment coffee directly into the hulling queue.
              This bypasses cherry intake and drying stages.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Region */}
            <div className="space-y-2">
              <Label>Origin Region <span className="text-destructive">*</span></Label>
              <Select value={intakeRegion} onValueChange={setIntakeRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region…" />
                </SelectTrigger>
                <SelectContent>
                  {ETHIOPIAN_REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <Label>Total Dry Weight (KG) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 1500"
                value={intakeWeight}
                onChange={(e) => setIntakeWeight(e.target.value)}
              />
            </div>

            {/* Optional custom lot number */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Custom Lot Number
                <span className="text-xs text-muted-foreground font-normal">(optional — auto-generated if blank)</span>
              </Label>
              <Input
                placeholder="e.g. DRY-YRG-2025-001"
                value={intakeLotNumber}
                onChange={(e) => setIntakeLotNumber(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Supplier, purchase date, quality grade, etc."
                rows={3}
                value={intakeNotes}
                onChange={(e) => setIntakeNotes(e.target.value)}
              />
            </div>

            {/* Preview lot number */}
            {intakeRegion && !intakeLotNumber && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                Auto lot #: <span className="font-mono font-medium">DRY-{intakeRegion.slice(0, 3).toUpperCase()}-XXXX</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDirectIntake(false);
                setIntakeRegion("");
                setIntakeWeight("");
                setIntakeNotes("");
                setIntakeLotNumber("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addDirectDriedLot.mutate()}
              disabled={!canSubmitIntake}
            >
              {addDirectDriedLot.isPending ? "Registering…" : "Register & Queue for Hulling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GrindingPage;
