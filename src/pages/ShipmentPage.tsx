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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  preparing: "bg-muted text-muted-foreground",
  in_transit: "bg-info/10 text-info",
  arrived: "bg-warning/10 text-warning",
  confirmed: "bg-success/10 text-success",
};

const statusLabels: Record<string, string> = {
  preparing: "Preparing",
  in_transit: "In Transit",
  arrived: "Arrived",
  confirmed: "Confirmed",
};

const ShipmentPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [destination, setDestination] = useState("Addis Ababa Warehouse");
  const [shipDate, setShipDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: shipments, isLoading } = useQuery({
    queryKey: ["shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*, lot:lots!shipments_lot_id_fkey(lot_number, region, current_weight)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: readyLots } = useQuery({
    queryKey: ["lots-ready-shipment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("status", "ready_for_shipment" as any);
      if (error) throw error;
      return data;
    },
  });

  const createShipment = useMutation({
    mutationFn: async () => {
      if (!orgId || !selectedLotId) throw new Error("Required fields missing");
      const lot = readyLots?.find((l) => l.id === selectedLotId);
      if (!lot) throw new Error("Lot not found");
      const { error } = await supabase.from("shipments").insert({
        lot_id: selectedLotId,
        organization_id: orgId,
        weight: lot.current_weight,
        destination: destination.trim(),
        shipment_date: shipDate,
        status: "preparing",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["lots-ready-shipment"] });
      toast({ title: "Shipment created" });
      setShowCreate(false);
      setSelectedLotId("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, lotId }: { id: string; status: string; lotId?: string }) => {
      const updates: any = { status };
      if (status === "confirmed") updates.confirmed_at = new Date().toISOString();
      await supabase.from("shipments").update(updates).eq("id", id);
      if (status === "confirmed" && lotId) {
        await supabase.from("lots").update({ status: "shipped" as any }).eq("id", lotId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Shipment status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const nextStatus: Record<string, string> = {
    preparing: "in_transit",
    in_transit: "arrived",
    arrived: "confirmed",
  };

  const nextLabel: Record<string, string> = {
    preparing: "Mark In Transit",
    in_transit: "Mark Arrived",
    arrived: "Confirm Arrival",
  };

  const inTransitCount = shipments?.filter((s: any) => s.status === "in_transit").length || 0;
  const completedCount = shipments?.filter((s: any) => s.status === "confirmed").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Shipments</h1>
          <p className="text-muted-foreground mt-1">Track coffee shipments to destinations</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2" disabled={!readyLots?.length}>
          <Truck className="w-4 h-4" /> Create Shipment
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard title="Ready to Ship" value={readyLots?.length || 0} icon={<Package className="w-4 h-4" />} />
        <MetricCard title="Preparing" value={shipments?.filter((s: any) => s.status === "preparing").length || 0} icon={<Clock className="w-4 h-4" />} />
        <MetricCard title="In Transit" value={inTransitCount} icon={<Truck className="w-4 h-4" />} />
        <MetricCard title="Confirmed" value={completedCount} icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      {/* Shipments Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Region</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Weight (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : shipments && shipments.length > 0 ? (
                shipments.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono font-medium">{s.lot?.lot_number || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">{s.lot?.region || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(s.weight)}</td>
                    <td className="px-5 py-3.5 text-sm">{s.destination}</td>
                    <td className="px-5 py-3.5 text-sm">{format(new Date(s.shipment_date), "MMM dd, yyyy")}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${statusBadge[s.status] || "bg-muted text-muted-foreground"}`}>
                        {statusLabels[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {nextStatus[s.status] && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ id: s.id, status: nextStatus[s.status], lotId: s.lot_id })}
                          disabled={updateStatus.isPending}
                        >
                          {nextLabel[s.status]}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No shipments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Shipment Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Create Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Lot</Label>
              <Select value={selectedLotId} onValueChange={setSelectedLotId}>
                <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                <SelectContent>
                  {readyLots?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.lot_number} — {l.region} ({Number(l.current_weight)} KG)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Shipment Date</Label>
              <Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createShipment.mutate()} disabled={!selectedLotId || createShipment.isPending}>
              {createShipment.isPending ? "Creating..." : "Create Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShipmentPage;
