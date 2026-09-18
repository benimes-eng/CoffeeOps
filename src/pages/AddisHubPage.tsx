import { ResetModuleButton } from "@/components/common/ResetModuleButton";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Truck, Package, ArrowRight, Anchor, CheckCircle2,
  Clock, ShieldCheck, MapPin, Search
} from "lucide-react";
import { format } from "date-fns";

export interface AddisHubInventoryItem {
  id: string;
  organization_id: string;
  shipment_id?: string | null;
  lot_id?: string | null;
  lot_number: string;
  region: string;
  incoming_weight: number;
  current_weight: number;
  moisture_percentage?: number | null;
  warehouse_bay: string;
  received_at: string;
  status: "in_storage" | "staged_for_export" | "shipped_to_port";
}

export interface DjiboutiDispatch {
  id: string;
  organization_id: string;
  hub_inventory_id: string;
  dispatch_number: string;
  container_number: string;
  vessel_name: string;
  booking_reference: string;
  seal_number: string;
  total_weight: number;
  dispatch_date: string;
  expected_port_arrival?: string | null;
  status: "dispatched" | "in_transit_port" | "arrived_djibouti" | "loaded_on_vessel";
  notes?: string | null;
}

export interface IncomingShipmentWithLot {
  id: string;
  shipment_number: string | null;
  lot_id: string;
  destination: string;
  weight: number;
  status: string;
  created_at: string;
  lot?: {
    lot_number: string;
    region: string;
    initial_weight: number;
    current_weight: number;
  } | null;
}

const dispatchStatusBadge: Record<string, string> = {
  dispatched: "bg-blue-500/10 text-blue-700 border-blue-200",
  in_transit_port: "bg-amber-500/10 text-amber-700 border-amber-200",
  arrived_djibouti: "bg-purple-500/10 text-purple-700 border-purple-200",
  loaded_on_vessel: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

const AddisHubPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("incoming");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal: Receive Consignment
  const [receivingShipment, setReceivingShipment] = useState<IncomingShipmentWithLot | null>(null);
  const [actualWeight, setActualWeight] = useState("");
  const [moisture, setMoisture] = useState("11.5");
  const [warehouseBay, setWarehouseBay] = useState("Bay-A1");

  // Modal: Export to Djibouti
  const [showDjiboutiModal, setShowDjiboutiModal] = useState(false);
  const [selectedHubLotId, setSelectedHubLotId] = useState("");
  const [containerNumber, setContainerNumber] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [dispatchWeight, setDispatchWeight] = useState("");
  const [portArrivalDate, setPortArrivalDate] = useState("");

  // 1. Fetch incoming shipments designated to Addis Ababa
  const { data: incomingShipments, isLoading: loadingShipments } = useQuery({
    queryKey: ["addis-incoming-shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*, lot:lots(lot_number, region, initial_weight, current_weight)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Filter for shipments heading to Addis Ababa or Dry Ports
      return (((data || []) as unknown as IncomingShipmentWithLot[])).filter((s) => {
        const dest = (s.destination || "").toLowerCase();
        return (
          dest.includes("addis") ||
          dest.includes("kality") ||
          dest.includes("ecx") ||
          dest.includes("mojo")
        );
      });
    },
  });

  // 2. Fetch Addis Ababa Hub inventory
  const { data: hubInventory, isLoading: loadingInventory } = useQuery({
    queryKey: ["addis-hub-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addis_hub_inventory")
        .select("*")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data as AddisHubInventoryItem[]) || [];
    },
  });

  // 3. Fetch Djibouti export dispatches
  const { data: djiboutiDispatches, isLoading: loadingDispatches } = useQuery({
    queryKey: ["djibouti-dispatches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("djibouti_dispatches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DjiboutiDispatch[]) || [];
    },
  });

  // Action: Receive Consignment at Addis Hub (authoritative fail-closed)
  const receiveConsignment = useMutation({
    mutationFn: async () => {
      if (!receivingShipment) throw new Error("No shipment selected");
      const weightNum = parseFloat(actualWeight);
      const moistNum = parseFloat(moisture);
      if (isNaN(weightNum) || weightNum <= 0) throw new Error("Please enter a valid weight");

      const { data, error } = await supabase.rpc("fn_receive_at_addis_hub", {
        p_shipment_id: receivingShipment.id,
        p_actual_weight: weightNum,
        p_moisture: isNaN(moistNum) ? 11.5 : moistNum,
        p_warehouse_bay: warehouseBay || "Bay-A1",
      });

      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addis-incoming-shipments"] });
      qc.invalidateQueries({ queryKey: ["addis-hub-inventory"] });
      toast({
        title: "Consignment Checked In",
        description: `Coffee received and logged into Addis Ababa dry port storage (${warehouseBay}).`,
      });
      setReceivingShipment(null);
    },
    onError: (err: Error) => {
      toast({ title: "Check-in failed", description: err.message, variant: "destructive" });
    },
  });

  // Action: Dispatch from Addis Ababa Hub to Djibouti Port (authoritative fail-closed)
  const dispatchToDjibouti = useMutation({
    mutationFn: async () => {
      if (!selectedHubLotId) throw new Error("Select a coffee lot from inventory");
      if (!containerNumber.trim()) throw new Error("Container number is required");
      if (!sealNumber.trim()) throw new Error("Seal number is required");
      const weightNum = parseFloat(dispatchWeight);
      if (isNaN(weightNum) || weightNum <= 0) throw new Error("Valid dispatch weight is required");

      const { data, error } = await supabase.rpc("fn_dispatch_to_djibouti", {
        p_hub_inventory_id: selectedHubLotId,
        p_container_number: containerNumber.trim(),
        p_vessel_name: vesselName.trim() || "MAERSK BULKER",
        p_booking_ref: bookingRef.trim() || `BK-${Date.now().toString().slice(-6)}`,
        p_seal_number: sealNumber.trim(),
        p_dispatch_weight: weightNum,
        p_expected_arrival: portArrivalDate || new Date().toISOString().split("T")[0],
      });

      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addis-hub-inventory"] });
      qc.invalidateQueries({ queryKey: ["djibouti-dispatches"] });
      toast({
        title: "Export Container Dispatched",
        description: `Consignment sealed and dispatched on Addis-Djibouti corridor to Port Terminal.`,
      });
      setShowDjiboutiModal(false);
      setContainerNumber("");
      setSealNumber("");
      setVesselName("");
      setBookingRef("");
      setDispatchWeight("");
    },
    onError: (err: Error) => {
      toast({ title: "Dispatch failed", description: err.message, variant: "destructive" });
    },
  });

  const openReceiveModal = (s: IncomingShipmentWithLot) => {
    setReceivingShipment(s);
    setActualWeight(String(s.weight || 0));
    setMoisture("11.5");
    setWarehouseBay("Bay-A1");
  };

  const totalInHubStorage = (hubInventory || [])
    .filter((item: AddisHubInventoryItem) => item.status === "in_storage")
    .reduce((sum: number, item: AddisHubInventoryItem) => sum + Number(item.current_weight || 0), 0);

  const totalDispatchedDjibouti = (djiboutiDispatches || [])
    .reduce((sum: number, d: DjiboutiDispatch) => sum + Number(d.total_weight || 0), 0);

  const pendingIncomingCount = (incomingShipments || [])
    .filter((s: IncomingShipmentWithLot) => s.status === "in_transit" || s.status === "preparing")
    .length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-serif text-foreground">Addis Ababa Dry Port & Logistics Hub</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
              Central Consolidation
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            Receive incoming coffee consignments from washing stations, manage dry port inventory, and dispatch export containers to Djibouti Port
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResetModuleButton module="addis_hub" moduleLabel="Addis Hub" />
          <Button
            onClick={() => setShowDjiboutiModal(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!hubInventory?.some((i: AddisHubInventoryItem) => i.current_weight > 0)}
          >
            <Anchor className="w-4 h-4" /> Dispatch to Djibouti Port
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="In Hub Warehouse Storage"
          value={`${totalInHubStorage.toLocaleString()} KG`}
          subtitle="Consolidated clean coffee"
          icon={<Building2 className="w-4 h-4" />}
        />
        <MetricCard
          title="Incoming In-Transit"
          value={pendingIncomingCount}
          subtitle="Consignments en route to Addis"
          icon={<Truck className="w-4 h-4" />}
        />
        <MetricCard
          title="Dispatched to Djibouti Port"
          value={`${totalDispatchedDjibouti.toLocaleString()} KG`}
          subtitle="Containerized for sea export"
          icon={<Anchor className="w-4 h-4 text-emerald-600" />}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="incoming" className="gap-2">
            <Truck className="w-4 h-4" /> Incoming Consignments ({pendingIncomingCount})
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="w-4 h-4" /> Addis Central Stock ({hubInventory?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="djibouti" className="gap-2">
            <Anchor className="w-4 h-4" /> Djibouti Port Export Dispatches ({djiboutiDispatches?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Incoming Shipments from Washing Stations */}
        <TabsContent value="incoming">
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="font-semibold text-foreground">Consignments En Route to Addis Ababa</h3>
                <p className="text-xs text-muted-foreground">
                  Shipments originating from wet mills and hulling stations addressed to Kality / Mojo / ECX Addis Hub
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipment #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Region</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatched Weight</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destination Hub</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingShipments ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading shipments...</td></tr>
                  ) : incomingShipments && incomingShipments.length > 0 ? (
                    incomingShipments.map((s: IncomingShipmentWithLot) => {
                      const isArrivedOrTransit = s.status === "in_transit" || s.status === "preparing" || s.status === "arrived";
                      const isConfirmed = s.status === "confirmed";

                      return (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-mono font-medium text-primary">
                            {s.shipment_number || `SH-${s.id.slice(0, 8)}`}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-mono">{s.lot?.lot_number || "—"}</td>
                          <td className="px-5 py-3.5 text-sm">{s.lot?.region || "—"}</td>
                          <td className="px-5 py-3.5 text-sm font-semibold">{Number(s.weight).toLocaleString()} KG</td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {s.destination}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              isConfirmed ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
                            }`}>
                              {s.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {isArrivedOrTransit ? (
                              <Button
                                size="sm"
                                onClick={() => openReceiveModal(s)}
                                className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Receive & Check-in
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Received at Hub
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        No consignments currently en route to Addis Ababa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Addis Central Warehouse Inventory */}
        <TabsContent value="inventory">
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="font-semibold text-foreground">Addis Ababa Dry Port Stock Inventory</h3>
                <p className="text-xs text-muted-foreground">
                  Consolidated green coffee stored in warehouse bays ready for container stuffing and Djibouti transport
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowDjiboutiModal(true)}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Anchor className="w-3.5 h-3.5" /> Stuff Container for Djibouti
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Origin Region</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warehouse Bay</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Available Stock</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Moisture %</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Received Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingInventory ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading inventory...</td></tr>
                  ) : hubInventory && hubInventory.length > 0 ? (
                    hubInventory.map((item: AddisHubInventoryItem) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-mono font-medium text-foreground">{item.lot_number}</td>
                        <td className="px-5 py-3.5 text-sm">{item.region}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-primary font-semibold">{item.warehouse_bay}</td>
                        <td className="px-5 py-3.5 text-sm font-bold">{Number(item.current_weight).toLocaleString()} KG</td>
                        <td className="px-5 py-3.5 text-sm font-mono">{item.moisture_percentage ? `${item.moisture_percentage}%` : "11.5%"}</td>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground">
                          {format(new Date(item.received_at), "MMM d, yyyy")}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            item.current_weight > 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
                          }`}>
                            {item.current_weight > 0 ? "In Storage" : "Shipped to Port"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No coffee stock in Addis Hub warehouse yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Djibouti Port Export Dispatches */}
        <TabsContent value="djibouti">
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="font-semibold text-foreground">Sea Export Dispatches to Djibouti Port Terminal</h3>
                <p className="text-xs text-muted-foreground">
                  Containerized coffee shipments booked for ocean freight from Port of Djibouti (Doraleh Container Terminal)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Container Number</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customs Seal #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Weight (KG)</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrier Vessel</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Booking Ref</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDispatches ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading dispatches...</td></tr>
                  ) : djiboutiDispatches && djiboutiDispatches.length > 0 ? (
                    djiboutiDispatches.map((d: DjiboutiDispatch) => (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-mono font-medium text-primary">{d.dispatch_number}</td>
                        <td className="px-5 py-3.5 text-sm font-mono font-bold">{d.container_number}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-muted-foreground">{d.seal_number}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold">{Number(d.total_weight).toLocaleString()} KG</td>
                        <td className="px-5 py-3.5 text-sm font-medium">{d.vessel_name}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-xs">{d.booking_reference}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${
                            dispatchStatusBadge[d.status] || "bg-muted text-muted-foreground"
                          }`}>
                            {d.status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        No containers dispatched to Djibouti Port yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal: Receive Consignment at Addis Hub */}
      <Dialog open={!!receivingShipment} onOpenChange={(open) => !open && setReceivingShipment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Receive Consignment at Addis Hub</DialogTitle>
            <DialogDescription>
              Verify scale weight and moisture content upon offloading into the central dry port warehouse.
            </DialogDescription>
          </DialogHeader>

          {receivingShipment && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <p><strong>Shipment ID:</strong> {receivingShipment.shipment_number || receivingShipment.id}</p>
                <p><strong>Origin Lot:</strong> {receivingShipment.lot?.lot_number} ({receivingShipment.lot?.region})</p>
                <p><strong>Manifest Weight:</strong> {Number(receivingShipment.weight).toLocaleString()} KG</p>
              </div>

              <div className="space-y-2">
                <Label>Verified Offloaded Weight (KG)</Label>
                <Input
                  type="number"
                  value={actualWeight}
                  onChange={(e) => setActualWeight(e.target.value)}
                  placeholder="e.g. 19200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Moisture Check (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={moisture}
                    onChange={(e) => setMoisture(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Warehouse Bay</Label>
                  <Select value={warehouseBay} onValueChange={setWarehouseBay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bay-A1">Bay A1 (Export Ready)</SelectItem>
                      <SelectItem value="Bay-A2">Bay A2 (Graded Sidama)</SelectItem>
                      <SelectItem value="Bay-B1">Bay B1 (Yirgacheffe)</SelectItem>
                      <SelectItem value="Bay-B2">Bay B2 (Guji Consignment)</SelectItem>
                      <SelectItem value="Bay-C1">Bay C1 (General Transit)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivingShipment(null)}>Cancel</Button>
            <Button
              onClick={() => receiveConsignment.mutate()}
              disabled={receiveConsignment.isPending}
              className="gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {receiveConsignment.isPending ? "Logging..." : "Confirm & Store in Hub"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Dispatch to Djibouti Port */}
      <Dialog open={showDjiboutiModal} onOpenChange={setShowDjiboutiModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Export Dispatch to Djibouti Port</DialogTitle>
            <DialogDescription>
              Record container stuffing, shipping line booking, customs seal, and dispatch to Doraleh Container Terminal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Stored Coffee Lot</Label>
              <Select value={selectedHubLotId} onValueChange={(id) => {
                setSelectedHubLotId(id);
                const selected = hubInventory?.find((i: AddisHubInventoryItem) => i.id === id);
                if (selected) setDispatchWeight(String(selected.current_weight));
              }}>
                <SelectTrigger><SelectValue placeholder="Select lot from inventory..." /></SelectTrigger>
                <SelectContent>
                  {(hubInventory || [])
                    .filter((item: AddisHubInventoryItem) => item.current_weight > 0)
                    .map((item: AddisHubInventoryItem) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.lot_number} — {item.region} ({Number(item.current_weight).toLocaleString()} KG in {item.warehouse_bay})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Container Number</Label>
                <Input
                  placeholder="e.g. MSKU-928412-1"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Customs Port Seal #</Label>
                <Input
                  placeholder="e.g. SL-ET-88319"
                  value={sealNumber}
                  onChange={(e) => setSealNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ocean Vessel / Line</Label>
                <Input
                  placeholder="e.g. CMA CGM BARRACUDA"
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Carrier Booking Ref</Label>
                <Input
                  placeholder="e.g. BK-ADD-DJIB-2026"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dispatch Weight (KG)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 19200"
                  value={dispatchWeight}
                  onChange={(e) => setDispatchWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Port Arrival</Label>
                <Input
                  type="date"
                  value={portArrivalDate}
                  onChange={(e) => setPortArrivalDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDjiboutiModal(false)}>Cancel</Button>
            <Button
              onClick={() => dispatchToDjibouti.mutate()}
              disabled={dispatchToDjibouti.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Anchor className="w-4 h-4" />
              {dispatchToDjibouti.isPending ? "Dispatching..." : "Seal & Dispatch to Djibouti"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddisHubPage;
