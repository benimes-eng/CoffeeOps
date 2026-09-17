import { useState } from "react";
import { useShipments, useCreateShipment, useUpdateShipmentStatus, ShipmentWithLot } from "@/hooks/useShipments";
import { useLots } from "@/hooks/useLots";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Package, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  preparing: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-blue-500/10 text-blue-700 border-blue-200",
  arrived: "bg-amber-500/10 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

const nextStatus: Record<string, string> = {
  preparing: "in_transit",
  in_transit: "arrived",
  arrived: "confirmed",
};

const nextLabel: Record<string, string> = {
  preparing: "Mark In Transit",
  in_transit: "Mark Arrived",
  arrived: "Confirm Delivery",
};

const DESTINATIONS = [
  "Addis Ababa Dry Port (Kality)",
  "Djibouti Export Terminal",
  "Dire Dawa Dry Port",
  "Mojo Dry Port",
  "ECX Central Warehouse (Bole)",
] as const;

const ShipmentPage = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [destination, setDestination] = useState<string>("Addis Ababa Dry Port (Kality)");
  const [customDest, setCustomDest] = useState("");
  const [shipDate, setShipDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: shipments, isLoading } = useShipments();
  const { data: readyLots } = useLots("ready_for_shipment");
  const createShipment = useCreateShipment();
  const updateStatus = useUpdateShipmentStatus();

  const handleCreate = () => {
    const finalDest = destination === "Other" ? customDest.trim() : destination;
    if (!selectedLotId || !finalDest) return;

    createShipment.mutate(
      {
        lotId: selectedLotId,
        destination: finalDest,
        shipmentDate: shipDate,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setSelectedLotId("");
          setCustomDest("");
        },
      }
    );
  };

  const inTransitCount = (shipments || []).filter((s: ShipmentWithLot) => s.status === "in_transit").length;
  const completedCount = (shipments || []).filter((s: ShipmentWithLot) => s.status === "confirmed").length;
  const preparingCount = (shipments || []).filter((s: ShipmentWithLot) => s.status === "preparing").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Export Shipments</h1>
          <p className="text-muted-foreground mt-1">
            Dispatch coffee consignments with document tracking and delivery verification
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2"
          disabled={!readyLots?.length}
        >
          <Truck className="w-4 h-4" /> Create Consignment Dispatch
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Ready for Export"
          value={readyLots?.length || 0}
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          title="Preparing"
          value={preparingCount}
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="In Transit"
          value={inTransitCount}
          icon={<Truck className="w-4 h-4" />}
        />
        <MetricCard
          title="Delivered & Confirmed"
          value={completedCount}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Shipment #
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Lot #
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Region
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Weight (KG)
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Destination
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Dispatch Date
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
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    Loading shipments...
                  </td>
                </tr>
              ) : shipments && shipments.length > 0 ? (
                shipments.map((s: ShipmentWithLot) => {
                  const currentStatus = s.status;
                  const next = nextStatus[currentStatus];
                  const label = nextLabel[currentStatus];

                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm font-mono font-medium text-primary">
                        {s.shipment_number || `SH-${s.id.slice(0, 8)}`}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-mono">{s.lot?.lot_number || "—"}</td>
                      <td className="px-5 py-3.5 text-sm">{s.lot?.region || "—"}</td>
                      <td className="px-5 py-3.5 text-sm font-medium">
                        {Number(s.weight).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-sm">{s.destination}</td>
                      <td className="px-5 py-3.5 text-sm">
                        {format(new Date(s.shipment_date), "MMM dd, yyyy")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                            statusBadge[s.status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {next && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-xs"
                            onClick={() =>
                              updateStatus.mutate({
                                shipmentId: s.id,
                                status: next,
                                lotId: s.lot_id,
                              })
                            }
                            disabled={updateStatus.isPending}
                          >
                            {label} <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    No shipments dispatched yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Shipment Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Create Export Consignment</DialogTitle>
            <DialogDescription>
              Assign available clean green coffee lot to an export destination. A server tracking number will be generated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Ready Coffee Lot</Label>
              <Select value={selectedLotId} onValueChange={setSelectedLotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clean coffee lot" />
                </SelectTrigger>
                <SelectContent>
                  {(readyLots || []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.lot_number} — {l.region} ({Number(l.current_weight).toLocaleString()} KG)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Destination Dry Port / Warehouse</Label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Destination" />
                </SelectTrigger>
                <SelectContent>
                  {DESTINATIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                  <SelectItem value="Other">Custom Destination...</SelectItem>
                </SelectContent>
              </Select>
              {destination === "Other" && (
                <Input
                  className="mt-2"
                  placeholder="Specify destination"
                  value={customDest}
                  onChange={(e) => setCustomDest(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Shipment Date</Label>
              <Input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedLotId || createShipment.isPending}
              className="gap-2"
            >
              <Truck className="w-4 h-4" />
              {createShipment.isPending ? "Generating Consignment..." : "Create Consignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShipmentPage;
