import { useState } from "react";
import { Plus, Package, Truck, Clock, Archive, Merge, Coffee, Eye, Filter, Info } from "lucide-react";
import { useLots, useCreateLot, useMergeLots } from "@/hooks/useLots";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { LotDetailModal } from "@/components/lots/LotDetailModal";
import { ETHIOPIAN_COFFEE_REGIONS } from "@/validation/schemas";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  received: "bg-blue-500/10 text-blue-700 border-blue-200",
  drying: "bg-amber-500/10 text-amber-700 border-amber-200",
  ready_for_grinding: "bg-purple-500/10 text-purple-700 border-purple-200",
  grinding: "bg-orange-500/10 text-orange-700 border-orange-200",
  ready_for_shipment: "bg-teal-500/10 text-teal-700 border-teal-200",
  shipped: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  merged: "bg-muted text-muted-foreground border-border",
};

const statusLabels: Record<string, string> = {
  received: "Received",
  drying: "Drying",
  ready_for_grinding: "Ready for Grinding",
  grinding: "Grinding",
  ready_for_shipment: "Ready for Shipment",
  shipped: "Shipped",
  merged: "Merged (Archived)",
};

const WarehousePage = () => {
  const [showIntake, setShowIntake] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Intake Form fields
  const [region, setRegion] = useState<string>("Yirgacheffe");
  const [customRegion, setCustomRegion] = useState("");
  const [weight, setWeight] = useState("");
  const [intakeDate, setIntakeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  // Merge selection
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [mergeNotes, setMergeNotes] = useState("");

  const { data: lots, isLoading } = useLots();
  const createLot = useCreateLot();
  const mergeLots = useMergeLots();

  const handleCreateIntake = () => {
    const finalRegion = region === "Other" ? customRegion.trim() : region;
    const w = Number(weight);
    if (!finalRegion || !w || w <= 0) return;

    createLot.mutate(
      {
        region: finalRegion,
        initial_weight: w,
        intake_date: intakeDate,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowIntake(false);
          setWeight("");
          setNotes("");
        },
      }
    );
  };

  const handleMerge = () => {
    if (mergeIds.length < 2) return;
    mergeLots.mutate(
      {
        sourceLotIds: mergeIds,
        notes: mergeNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowMerge(false);
          setMergeIds([]);
          setMergeNotes("");
        },
      }
    );
  };

  // Filter lots
  const filteredLots = (lots || []).filter((l) => {
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    const matchesSearch =
      l.lot_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.region.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // KPI calculations
  const totalStock = (lots || [])
    .filter((l) => l.status !== "shipped" && l.status !== "merged")
    .reduce((s, l) => s + Number(l.current_weight), 0);
  const inDrying = (lots || []).filter((l) => l.status === "drying").length;
  const readyForGrinding = (lots || []).filter((l) => l.status === "ready_for_grinding").length;
  const readyToShip = (lots || []).filter((l) => l.status === "ready_for_shipment").length;

  // Mergeable lots: must be in ready_for_grinding
  const mergeableLots = (lots || []).filter((l) => l.status === "ready_for_grinding");
  const selectedMergeLots = mergeableLots.filter((l) => mergeIds.includes(l.id));
  const canMerge =
    selectedMergeLots.length >= 2 && new Set(selectedMergeLots.map((l) => l.region)).size === 1;
  const totalMergeWeight = selectedMergeLots.reduce((acc, l) => acc + Number(l.current_weight), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Warehouse & Stock</h1>
          <p className="text-muted-foreground mt-1">
            Intake registration, parchment stock, and traceability-safe batch merging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowMerge(true)}
            className="gap-2"
            disabled={mergeableLots.length < 2}
          >
            <Merge className="w-4 h-4" /> Merge Batches
          </Button>
          <Button onClick={() => setShowIntake(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Cherry Intake
          </Button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Active Stock"
          value={`${totalStock.toLocaleString()} KG`}
          icon={<Archive className="w-4 h-4" />}
        />
        <MetricCard title="Currently Drying" value={inDrying} icon={<Clock className="w-4 h-4" />} />
        <MetricCard
          title="Ready for Hulling"
          value={readyForGrinding}
          icon={<Coffee className="w-4 h-4" />}
        />
        <MetricCard title="Ready to Ship" value={readyToShip} icon={<Truck className="w-4 h-4" />} />
      </div>

      {/* Search and Filters */}
      <div className="bg-card p-4 rounded-xl card-shadow border border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-80">
          <Input
            placeholder="Search lot number or region..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="drying">Drying</SelectItem>
              <SelectItem value="ready_for_grinding">Ready for Grinding</SelectItem>
              <SelectItem value="grinding">Grinding</SelectItem>
              <SelectItem value="ready_for_shipment">Ready for Shipment</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lots Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Lot Number
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Region
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Initial Wet (KG)
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Current Weight (KG)
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Intake Date
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
                    Loading lots...
                  </td>
                </tr>
              ) : filteredLots.length > 0 ? (
                filteredLots.map((lot) => (
                  <tr
                    key={lot.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedLotId(lot.id)}
                  >
                    <td className="px-5 py-3.5 text-sm font-mono font-medium">{lot.lot_number}</td>
                    <td className="px-5 py-3.5 text-sm">{lot.region}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(lot.initial_weight).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm font-medium">
                      {Number(lot.current_weight).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-sm">{format(new Date(lot.intake_date), "MMM dd, yyyy")}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          statusBadge[lot.status] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {statusLabels[lot.status] || lot.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => setSelectedLotId(lot.id)}
                      >
                        <Eye className="w-3.5 h-3.5" /> Timeline
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No coffee lots found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lot Detail Timeline Modal */}
      <LotDetailModal
        lotId={selectedLotId}
        open={!!selectedLotId}
        onClose={() => setSelectedLotId(null)}
      />

      {/* Intake Dialog */}
      <Dialog open={showIntake} onOpenChange={setShowIntake}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Register New Cherry Intake</DialogTitle>
            <DialogDescription>
              A collision-safe lot document number will be automatically generated by the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Origin Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Ethiopian Region" />
                </SelectTrigger>
                <SelectContent>
                  {ETHIOPIAN_COFFEE_REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value="Other">Other Region...</SelectItem>
                </SelectContent>
              </Select>
              {region === "Other" && (
                <Input
                  className="mt-2"
                  placeholder="Specify origin region"
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Wet Cherry Intake Weight (KG)</Label>
              <Input
                type="number"
                placeholder="e.g. 1500"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Intake Date</Label>
              <Input
                type="date"
                value={intakeDate}
                onChange={(e) => setIntakeDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes / Supplier Reference (Optional)</Label>
              <Textarea
                placeholder="e.g. Cooperative delivery from Gedeo smallholders"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntake(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateIntake}
              disabled={createLot.isPending}
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              {createLot.isPending ? "Allocating Number..." : "Register Intake"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Traceability-Safe Merge Dialog */}
      <Dialog
        open={showMerge}
        onOpenChange={(v) => {
          if (!v) {
            setShowMerge(false);
            setMergeIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Traceability-Safe Batch Merge</DialogTitle>
            <DialogDescription>
              Select batches from the same region ready for hulling. Source lots will be marked as merged (preserving traceability) and a new unified consignment will be created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-60 overflow-y-auto py-2">
            {mergeableLots.map((lot) => (
              <label
                key={lot.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  mergeIds.includes(lot.id)
                    ? "border-primary bg-primary/5"
                    : "border-border/50 hover:bg-muted/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={mergeIds.includes(lot.id)}
                  onChange={(e) =>
                    setMergeIds(
                      e.target.checked
                        ? [...mergeIds, lot.id]
                        : mergeIds.filter((id) => id !== lot.id)
                    )
                  }
                  className="rounded"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium font-mono">{lot.lot_number}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {lot.region} • {Number(lot.current_weight).toLocaleString()} KG
                  </span>
                </div>
              </label>
            ))}
          </div>

          {selectedMergeLots.length >= 2 && !canMerge && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              Origin Integrity Rule: Selected lots must originate from the same coffee region.
            </div>
          )}

          {canMerge && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-xs flex justify-between items-center">
              <span>Combined Output Weight:</span>
              <span className="font-semibold text-sm">{totalMergeWeight.toLocaleString()} KG</span>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMerge(false);
                setMergeIds([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={!canMerge || mergeLots.isPending}>
              {mergeLots.isPending ? "Merging..." : `Merge ${mergeIds.length} Batches`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehousePage;
