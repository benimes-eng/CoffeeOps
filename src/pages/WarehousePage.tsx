import { useState } from "react";
import { Plus, Package, Truck, Clock, Archive, Merge, Coffee } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  received: "bg-info/10 text-info",
  drying: "bg-warning/10 text-warning",
  finished: "bg-success/10 text-success",
  ready_for_grinding: "bg-accent/20 text-accent-foreground",
  grinding: "bg-info/10 text-info",
  ready_for_shipment: "bg-primary/10 text-primary",
  shipped: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  received: "Received",
  drying: "Drying",
  finished: "Finished",
  ready_for_grinding: "Ready for Grinding",
  grinding: "Grinding",
  ready_for_shipment: "Ready for Shipment",
  shipped: "Shipped",
};

const WarehousePage = () => {
  const [showIntake, setShowIntake] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [region, setRegion] = useState("");
  const [weight, setWeight] = useState("");
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();

  const { data: lots, isLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .order("intake_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createLot = useMutation({
    mutationFn: async () => {
      const w = Number(weight);
      if (!lotNumber.trim() || !region.trim() || !w || w <= 0 || !orgId) throw new Error("All fields are required");
      const { error } = await supabase.from("lots").insert({
        lot_number: lotNumber.trim(),
        region: region.trim(),
        initial_weight: w,
        current_weight: w,
        organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Lot registered successfully" });
      setShowIntake(false); setLotNumber(""); setRegion(""); setWeight("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const confirmForGrinding = useMutation({
    mutationFn: async (lotId: string) => {
      await supabase.from("lots").update({ status: "ready_for_grinding" as any }).eq("id", lotId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Lot confirmed for grinding" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const mergeLots = useMutation({
    mutationFn: async () => {
      if (!orgId || mergeIds.length < 2) throw new Error("Select at least 2 lots");
      const selected = lots?.filter((l) => mergeIds.includes(l.id));
      if (!selected || selected.length < 2) throw new Error("Invalid lots");
      // Verify same region
      const regions = new Set(selected.map((l) => l.region));
      if (regions.size > 1) throw new Error("Can only merge lots from same region");
      const totalWeight = selected.reduce((s, l) => s + Number(l.current_weight), 0);
      const mergedNumber = `MERGED-${Date.now().toString(36).toUpperCase()}`;
      // Create merged lot
      const { error } = await supabase.from("lots").insert({
        lot_number: mergedNumber,
        region: selected[0].region,
        initial_weight: totalWeight,
        current_weight: totalWeight,
        status: selected[0].status as any,
        organization_id: orgId,
      });
      if (error) throw error;
      // Mark old lots as shipped (archived)
      for (const id of mergeIds) {
        await supabase.from("lots").update({ status: "shipped" as any }).eq("id", id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Lots merged successfully" });
      setShowMerge(false); setMergeIds([]);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalStock = lots?.filter((l) => l.status !== "shipped").reduce((s, l) => s + Number(l.current_weight), 0) || 0;
  const inProcess = lots?.filter((l) => l.status === "received" || l.status === "drying").length || 0;
  const readyToShip = lots?.filter((l) => l.status === "ready_for_shipment").length || 0;
  const readyForGrinding = lots?.filter((l) => l.status === "finished" || l.status === "ready_for_grinding").length || 0;

  // Mergeable lots: same region, same-ish status
  const mergeableLots = lots?.filter((l) => ["received", "drying", "finished", "ready_for_grinding"].includes(l.status)) || [];
  const selectedMergeLots = mergeableLots.filter((l) => mergeIds.includes(l.id));
  const canMerge = selectedMergeLots.length >= 2 && new Set(selectedMergeLots.map((l) => l.region)).size === 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Warehouse</h1>
          <p className="text-muted-foreground mt-1">Intake, stock, and batch management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMerge(true)} className="gap-2" disabled={mergeableLots.length < 2}>
            <Merge className="w-4 h-4" /> Merge Batches
          </Button>
          <Button onClick={() => setShowIntake(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Intake
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard title="Total Stock" value={`${totalStock.toLocaleString()} KG`} icon={<Archive className="w-4 h-4" />} />
        <MetricCard title="In Process" value={inProcess} icon={<Clock className="w-4 h-4" />} />
        <MetricCard title="Ready for Grinding" value={readyForGrinding} icon={<Coffee className="w-4 h-4" />} />
        <MetricCard title="Ready to Ship" value={readyToShip} icon={<Truck className="w-4 h-4" />} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Region</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Initial (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intake Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : lots && lots.length > 0 ? (
                lots.map((lot) => (
                  <tr key={lot.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono font-medium">{lot.lot_number}</td>
                    <td className="px-5 py-3.5 text-sm">{lot.region}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(lot.initial_weight)}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(lot.current_weight)}</td>
                    <td className="px-5 py-3.5 text-sm">{format(new Date(lot.intake_date), "MMM dd, yyyy")}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${statusBadge[lot.status] || "bg-muted text-muted-foreground"}`}>
                        {statusLabels[lot.status] || lot.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {lot.status === "finished" && (
                        <Button size="sm" variant="outline" onClick={() => confirmForGrinding.mutate(lot.id)} disabled={confirmForGrinding.isPending}>
                          Confirm for Grinding
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No lots registered yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intake Dialog */}
      <Dialog open={showIntake} onOpenChange={setShowIntake}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif text-xl">Register New Lot</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Lot Number</Label><Input placeholder="e.g. LOT-2850" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} /></div>
            <div className="space-y-2"><Label>Region</Label><Input placeholder="e.g. Sidama" value={region} onChange={(e) => setRegion(e.target.value)} /></div>
            <div className="space-y-2"><Label>Intake Weight (KG)</Label><Input type="number" placeholder="e.g. 500" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntake(false)}>Cancel</Button>
            <Button onClick={() => createLot.mutate()} disabled={createLot.isPending} className="gap-2"><Package className="w-4 h-4" />{createLot.isPending ? "Registering..." : "Register Lot"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={showMerge} onOpenChange={(v) => { if (!v) { setShowMerge(false); setMergeIds([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-serif text-xl">Merge Batches</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Select lots from the same region to merge. Combined quantities will create a new batch.</p>
          <div className="space-y-2 max-h-60 overflow-y-auto py-2">
            {mergeableLots.map((lot) => (
              <label key={lot.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mergeIds.includes(lot.id) ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
                <input
                  type="checkbox"
                  checked={mergeIds.includes(lot.id)}
                  onChange={(e) => setMergeIds(e.target.checked ? [...mergeIds, lot.id] : mergeIds.filter((id) => id !== lot.id))}
                  className="rounded"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{lot.lot_number}</span>
                  <span className="text-xs text-muted-foreground ml-2">{lot.region} • {Number(lot.current_weight)} KG</span>
                </div>
              </label>
            ))}
          </div>
          {selectedMergeLots.length >= 2 && !canMerge && (
            <p className="text-xs text-destructive">Selected lots must be from the same region.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMerge(false); setMergeIds([]); }}>Cancel</Button>
            <Button onClick={() => mergeLots.mutate()} disabled={!canMerge || mergeLots.isPending}>
              {mergeLots.isPending ? "Merging..." : `Merge ${mergeIds.length} Lots`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehousePage;
