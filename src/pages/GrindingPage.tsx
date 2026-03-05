import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useToast } from "@/hooks/use-toast";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, CheckCircle2, Package } from "lucide-react";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  grinding: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
};

const GrindingPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const [showComplete, setShowComplete] = useState<string | null>(null);
  const [groundWeight, setGroundWeight] = useState("");

  const { data: batches, isLoading } = useQuery({
    queryKey: ["grinding-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grinding_batches")
        .select("*, lot:lots!grinding_batches_lot_id_fkey(lot_number, region)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Also show lots that are ready_for_grinding but don't have a grinding batch yet
  const { data: readyLots } = useQuery({
    queryKey: ["lots-ready-grinding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("status", "ready_for_grinding" as any)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const startGrinding = useMutation({
    mutationFn: async (lot: any) => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("grinding_batches").insert({
        lot_id: lot.id,
        organization_id: orgId,
        dry_weight: lot.current_weight,
        status: "grinding",
      } as any);
      if (error) throw error;
      await supabase.from("lots").update({ status: "grinding" as any }).eq("id", lot.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grinding-batches"] });
      qc.invalidateQueries({ queryKey: ["lots-ready-grinding"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Grinding started" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const completeGrinding = useMutation({
    mutationFn: async ({ batchId, lotId, weight }: { batchId: string; lotId: string; weight: number }) => {
      await supabase
        .from("grinding_batches")
        .update({ ground_weight: weight, status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", batchId);
      await supabase.from("lots").update({ status: "ready_for_shipment" as any, current_weight: weight }).eq("id", lotId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grinding-batches"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Grinding completed — batch ready for shipment" });
      setShowComplete(null);
      setGroundWeight("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pendingCount = batches?.filter((b: any) => b.status === "grinding").length || 0;
  const completedCount = batches?.filter((b: any) => b.status === "completed").length || 0;
  const selectedBatch = batches?.find((b: any) => b.id === showComplete);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Grinding</h1>
        <p className="text-muted-foreground mt-1">Manage coffee grinding process</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Ready for Grinding" value={readyLots?.length || 0} icon={<Package className="w-4 h-4" />} />
        <MetricCard title="Currently Grinding" value={pendingCount} icon={<Coffee className="w-4 h-4" />} />
        <MetricCard title="Completed" value={completedCount} icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      {/* Ready for Grinding */}
      {readyLots && readyLots.length > 0 && (
        <div className="bg-card rounded-xl card-shadow border border-border/50 p-5">
          <h3 className="font-serif text-lg mb-4">Ready for Grinding</h3>
          <div className="space-y-3">
            {readyLots.map((lot) => (
              <div key={lot.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{lot.lot_number}</p>
                  <p className="text-xs text-muted-foreground">{lot.region} • {Number(lot.current_weight)} KG</p>
                </div>
                <Button size="sm" onClick={() => startGrinding.mutate(lot)} disabled={startGrinding.isPending}>
                  Start Grinding
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grinding Batches Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Region</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dry Weight (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ground Weight (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : batches && batches.length > 0 ? (
                batches.map((batch: any) => (
                  <tr key={batch.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono font-medium">{batch.lot?.lot_number || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">{batch.lot?.region || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(batch.dry_weight)}</td>
                    <td className="px-5 py-3.5 text-sm">{batch.ground_weight ? Number(batch.ground_weight) : "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${statusBadge[batch.status] || "bg-muted text-muted-foreground"}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {batch.status === "grinding" && (
                        <Button size="sm" variant="outline" onClick={() => setShowComplete(batch.id)}>
                          Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No grinding batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Dialog */}
      <Dialog open={!!showComplete} onOpenChange={(v) => { if (!v) { setShowComplete(null); setGroundWeight(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Complete Grinding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedBatch && (
              <p className="text-sm text-muted-foreground">
                Lot: {(selectedBatch as any).lot?.lot_number} • Dry Weight: {Number((selectedBatch as any).dry_weight)} KG
              </p>
            )}
            <div className="space-y-2">
              <Label>Final Ground Coffee Weight (KG)</Label>
              <Input type="number" placeholder="e.g. 420" value={groundWeight} onChange={(e) => setGroundWeight(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowComplete(null); setGroundWeight(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedBatch && Number(groundWeight) > 0) {
                  completeGrinding.mutate({
                    batchId: selectedBatch.id,
                    lotId: (selectedBatch as any).lot_id,
                    weight: Number(groundWeight),
                  });
                }
              }}
              disabled={!Number(groundWeight) || completeGrinding.isPending}
            >
              {completeGrinding.isPending ? "Completing..." : "Complete Grinding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GrindingPage;
