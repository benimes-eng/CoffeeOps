import { useMemo } from "react";
import { type BedWithAssignment, getDryingColor } from "@/hooks/use-beds";
import { format } from "date-fns";
import { RotateCcw, Sparkles, CheckCircle, Package } from "lucide-react";
import { useLogBedAction, useMarkBedFinished } from "@/hooks/use-beds";
import { useToast } from "@/hooks/use-toast";

interface Props {
  beds: BedWithAssignment[];
  onSelectBed: (bed: BedWithAssignment) => void;
}

interface BatchGroup {
  intakeDate: string;
  lotNumber: string;
  region: string;
  beds: BedWithAssignment[];
  totalWeight: number;
  oldestDryingDay: number;
}

export function BatchView({ beds, onSelectBed }: Props) {
  const { toast } = useToast();
  const logAction = useLogBedAction();
  const markFinished = useMarkBedFinished();

  const batches = useMemo(() => {
    const map = new Map<string, BatchGroup>();
    beds.forEach((bed) => {
      if (!bed.activeAssignment?.lots) return;
      const lot = bed.activeAssignment.lots;
      const key = `${lot.intake_date}-${lot.lot_number}`;
      if (!map.has(key)) {
        map.set(key, {
          intakeDate: lot.intake_date,
          lotNumber: lot.lot_number,
          region: lot.region,
          beds: [],
          totalWeight: 0,
          oldestDryingDay: 0,
        });
      }
      const batch = map.get(key)!;
      batch.beds.push(bed);
      batch.totalWeight += bed.activeAssignment!.assigned_weight;
      if (bed.dryingDays !== undefined && bed.dryingDays > batch.oldestDryingDay) {
        batch.oldestDryingDay = bed.dryingDays;
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.intakeDate).getTime() - new Date(a.intakeDate).getTime());
  }, [beds]);

  const handleBulkAction = (batch: BatchGroup, action: string, desc: string) => {
    batch.beds.forEach((bed) => {
      logAction.mutate({
        bedId: bed.id,
        assignmentId: bed.activeAssignment?.id,
        actionType: action,
        description: desc,
      });
    });
    toast({ title: "Bulk action logged", description: `${action} for ${batch.beds.length} beds` });
  };

  const handleBulkFinish = (batch: BatchGroup) => {
    batch.beds.forEach((bed) => {
      if (bed.activeAssignment) {
        markFinished.mutate({ bedId: bed.id, assignmentId: bed.activeAssignment.id });
      }
    });
    toast({ title: "Batch finished", description: `${batch.beds.length} beds marked as finished` });
  };

  if (batches.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 card-shadow border border-border/50 text-center">
        <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No active batches to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {batches.map((batch) => {
        const progress = Math.min(Math.round((batch.oldestDryingDay / 14) * 100), 100);
        return (
          <div key={`${batch.intakeDate}-${batch.lotNumber}`} className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-serif text-lg">{batch.lotNumber}</h3>
                  <p className="text-sm text-muted-foreground">
                    {batch.region} · Intake {format(new Date(batch.intakeDate), "MMM dd, yyyy")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Day {batch.oldestDryingDay} of ~14</p>
                </div>
              </div>

              {/* Progress */}
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-success" : progress >= 50 ? "bg-warning" : "bg-status-red"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Beds</p>
                  <p className="text-lg font-serif">{batch.beds.length}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Weight</p>
                  <p className="text-lg font-serif">{batch.totalWeight} KG</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Oldest Day</p>
                  <p className="text-lg font-serif">{batch.oldestDryingDay}</p>
                </div>
              </div>

              {/* Bed chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {batch.beds.map((bed) => {
                  const color = getDryingColor(bed.dryingPhase);
                  return (
                    <button
                      key={bed.id}
                      onClick={() => onSelectBed(bed)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium ${color.bg} ${color.text} hover:opacity-80 transition-opacity`}
                    >
                      {bed.bed_number}
                    </button>
                  );
                })}
              </div>

              {/* Bulk Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkAction(batch, "turning", "Bulk turning for batch")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Turn All
                </button>
                <button
                  onClick={() => handleBulkAction(batch, "cleaning", "Bulk cleaning for batch")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
                >
                  <Sparkles className="w-3 h-3" /> Clean All
                </button>
                <button
                  onClick={() => handleBulkFinish(batch)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-success text-success-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity ml-auto"
                >
                  <CheckCircle className="w-3 h-3" /> Finish Batch
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
