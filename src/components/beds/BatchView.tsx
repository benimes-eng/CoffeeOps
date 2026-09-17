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
    return (
      <div className="bg-card rounded-lg p-12 border border-border text-center">
        <p className="text-sm text-muted-foreground">No active parchment drying batches found across washing station beds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {batches.map((batch) => (
        <div key={batch.date} className="bg-card rounded-lg p-5 border border-border/80 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border/60">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                  Batch {format(new Date(batch.date), "yyyy-MM-dd")}
                </span>
                <span className="text-xs text-muted-foreground">Intake Date: {format(new Date(batch.date), "MMMM d, yyyy")}</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {batch.beds.length} drying bed(s) • Total Parchment Weight: {batch.totalWeight.toLocaleString()} KG
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs font-bold font-mono text-foreground">Day {batch.oldestDay} / 14</span>
                <span className="text-[10px] text-muted-foreground block">
                  {batch.oldestDay > 10 ? "Near Target (11%)" : batch.oldestDay > 3 ? "Active Aeration" : "Initial Drying"}
                </span>
              </div>
              <div className="w-24 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border">
                <div
                  className={`h-full rounded-full ${batch.oldestDay > 10 ? "bg-emerald-600" : batch.oldestDay > 3 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, (batch.oldestDay / 14) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Assigned Beds:</span>
            {batch.beds.map((bed) => (
              <span key={bed.id} className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border px-2 py-1 rounded text-foreground font-medium">
                Bed {bed.bed_number} ({Number(bed.active_assignment?.assigned_weight)}kg)
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground font-medium mr-2">Batch Operations:</span>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs font-medium" onClick={() => bulkLog(batch, "turning", "Morning / afternoon batch turning and aeration")}>
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" /> Bulk Rake & Turn All
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs font-medium" onClick={() => bulkLog(batch, "cleaning", "Station hand-sorting and defect triage")}>
              <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Log Defect Hand-Sorting
            </Button>
            <Button variant="default" size="sm" className="gap-1.5 h-8 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white ml-auto" onClick={() => bulkFinish(batch)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Final Dry Weigh-Out
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
