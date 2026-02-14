import { BedWithDetails, getDryingDays } from "@/services/bedService";
import { useBedActions } from "@/hooks/useBedManagement";
import { Button } from "@/components/ui/button";
import { RotateCcw, Sparkles, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  beds: BedWithDetails[];
}

interface Batch {
  date: string;
  beds: BedWithDetails[];
  totalWeight: number;
  oldestDay: number;
}

export function BatchView({ beds }: Props) {
  const { logAction, finish } = useBedActions();
  
  const occupiedBeds = beds.filter((b) => b.active_assignment);

  // Group by intake date
  const batchMap = new Map<string, BedWithDetails[]>();
  occupiedBeds.forEach((bed) => {
    const date = bed.active_assignment!.assigned_date.split("T")[0];
    if (!batchMap.has(date)) batchMap.set(date, []);
    batchMap.get(date)!.push(bed);
  });

  const batches: Batch[] = Array.from(batchMap.entries())
    .map(([date, batchBeds]) => ({
      date,
      beds: batchBeds,
      totalWeight: batchBeds.reduce((s, b) => s + Number(b.active_assignment?.assigned_weight || 0), 0),
      oldestDay: Math.max(...batchBeds.map((b) => getDryingDays(b.active_assignment!.assigned_date))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bulkLog = (batch: Batch, actionType: string, desc: string) => {
    batch.beds.forEach((bed) => {
      logAction.mutate({
        bedId: bed.id,
        actionType,
        description: desc,
        assignmentId: bed.active_assignment?.id,
      });
    });
  };

  const bulkFinish = (batch: Batch) => {
    batch.beds.forEach((bed) => {
      if (bed.active_assignment) {
        finish.mutate({ bedId: bed.id, assignmentId: bed.active_assignment.id });
      }
    });
  };

  if (batches.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No active batches.</p>;
  }

  return (
    <div className="space-y-4">
      {batches.map((batch) => (
        <div key={batch.date} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-serif text-lg">
                Batch — {format(new Date(batch.date), "MMM dd, yyyy")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {batch.beds.length} bed(s) • {batch.totalWeight.toFixed(0)} KG • Day {batch.oldestDay}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Progress indicator */}
              <div className="w-20 h-2 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${batch.oldestDay > 10 ? "bg-success" : batch.oldestDay > 3 ? "bg-warning" : "bg-status-red"}`}
                  style={{ width: `${Math.min(100, (batch.oldestDay / 14) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {batch.beds.map((bed) => (
              <span key={bed.id} className="text-xs bg-muted px-2 py-1 rounded-md font-medium">
                {bed.bed_number}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => bulkLog(batch, "turning", "Bulk turning")}>
              <RotateCcw className="w-3.5 h-3.5" /> Turn All
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => bulkLog(batch, "cleaning", "Bulk cleaning")}>
              <Sparkles className="w-3.5 h-3.5" /> Clean All
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-success" onClick={() => bulkFinish(batch)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Finish Batch
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
