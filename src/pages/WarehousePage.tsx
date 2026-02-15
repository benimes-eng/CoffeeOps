import { useState } from "react";
import { Plus, Package, Truck, Clock, Archive } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  received: "bg-info/10 text-info",
  drying: "bg-warning/10 text-warning",
  finished: "bg-success/10 text-success",
  shipped: "bg-muted text-muted-foreground",
};

const WarehousePage = () => {
  const [showIntake, setShowIntake] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [region, setRegion] = useState("");
  const [weight, setWeight] = useState("");
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
      setShowIntake(false);
      setLotNumber("");
      setRegion("");
      setWeight("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalStock = lots?.reduce((s, l) => s + Number(l.current_weight), 0) || 0;
  const inProcess = lots?.filter((l) => l.status === "received" || l.status === "drying").length || 0;
  const readyToShip = lots?.filter((l) => l.status === "finished").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Warehouse</h1>
          <p className="text-muted-foreground mt-1">Intake and stock management</p>
        </div>
        <Button onClick={() => setShowIntake(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Intake
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Stock" value={`${totalStock.toLocaleString()} KG`} icon={<Archive className="w-4 h-4" />} />
        <MetricCard title="Lots In Process" value={inProcess} icon={<Clock className="w-4 h-4" />} />
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
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
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
                        {lot.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No lots registered yet. Click "New Intake" to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intake Dialog */}
      <Dialog open={showIntake} onOpenChange={setShowIntake}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Register New Lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Lot Number</Label>
              <Input placeholder="e.g. LOT-2850" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input placeholder="e.g. Sidama" value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Intake Weight (KG)</Label>
              <Input type="number" placeholder="e.g. 500" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntake(false)}>Cancel</Button>
            <Button onClick={() => createLot.mutate()} disabled={createLot.isPending} className="gap-2">
              <Package className="w-4 h-4" />
              {createLot.isPending ? "Registering..." : "Register Lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehousePage;
