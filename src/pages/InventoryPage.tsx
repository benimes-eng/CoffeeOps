import { useState } from "react";
import { Plus, Wrench, Package, Droplets, History, ArrowDownLeft, ArrowUpRight, Trash2 } from "lucide-react";
import { ResetModuleButton } from "@/components/common/ResetModuleButton";
import { deleteInventoryItem } from "@/services/dataManagementService";
import { useRole } from "@/hooks/use-role";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useInventoryItems,
  useInventoryMovements,
  useRecordInventoryMovement,
} from "@/hooks/useInventory";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type InventoryItemRow = Database["public"]["Tables"]["inventory_items"]["Row"];

const tabs = [
  { id: "machinery", label: "Machinery", icon: Wrench },
  { id: "equipment", label: "Equipment", icon: Package },
  { id: "consumable", label: "Consumables", icon: Droplets },
  { id: "ledger", label: "Movement Ledger", icon: History },
] as const;

const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState<string>("machinery");
  const [showAdd, setShowAdd] = useState(false);
  const [showMovement, setShowMovement] = useState<InventoryItemRow | null>(null);
  const [showDeleteItem, setShowDeleteItem] = useState<InventoryItemRow | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const { hasMinRole } = useRole();
  const canDelete = hasMinRole("manager");

  const deleteItemMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Item deleted", description: "Inventory item permanently removed." });
      setShowDeleteItem(null);
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // New Item form
  const [name, setName] = useState("");
  const [initialQty, setInitialQty] = useState("1");
  const [unit, setUnit] = useState("units");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Database["public"]["Enums"]["inventory_category"]>("machinery");

  // Movement form
  const [movementType, setMovementType] = useState<"in" | "out">("out");
  const [movementQty, setMovementQty] = useState("");
  const [reason, setReason] = useState("");

  const { data: items, isLoading: itemsLoading } = useInventoryItems();
  const { data: movements, isLoading: movementsLoading } = useInventoryMovements();
  const recordMovement = useRecordInventoryMovement();

  const filteredItems = (items || []).filter((i) => i.category === activeTab);

  const handleAddItem = async () => {
    if (!name.trim() || !orgId) return;
    const qty = Number(initialQty) || 0;

    const { error } = await supabase.from("inventory_items").insert({
      name: name.trim(),
      quantity: qty,
      unit: unit.trim() || null,
      location: location.trim() || null,
      category,
      organization_id: orgId,
    });

    if (error) {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Inventory Item Registered" });
      setShowAdd(false);
      setName("");
      setInitialQty("1");
      setLocation("");
    }
  };

  const handleRecordMovement = () => {
    if (!showMovement) return;
    const qty = Number(movementQty);
    if (!qty || qty <= 0 || !reason.trim()) {
      toast({ title: "Validation Error", description: "Quantity and reason are required", variant: "destructive" });
      return;
    }

    recordMovement.mutate(
      {
        itemId: showMovement.id,
        type: movementType,
        quantity: qty,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          setShowMovement(null);
          setMovementQty("");
          setReason("");
        },
      }
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Inventory & Machinery</h1>
          <p className="text-muted-foreground mt-1">
            Track equipment, consumables, and auditable stock movement ledgers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResetModuleButton module="inventory" moduleLabel="Inventory" />
          <Button
            onClick={() => {
              setCategory(activeTab === "ledger" ? "machinery" : activeTab);
              setShowAdd(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Register New Asset
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-card text-foreground card-shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab !== "ledger" ? (
        /* Inventory Table */
        <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Balance
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Unit
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Location
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Last Updated
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {itemsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                      Loading inventory...
                    </td>
                  </tr>
                ) : filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm font-medium">{item.name}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold">
                        {Number(item.quantity).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-sm">{item.unit || "—"}</td>
                      <td className="px-5 py-3.5 text-sm">{item.location || "—"}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">
                        {format(new Date(item.updated_at), "MMM dd, yyyy")}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => setShowMovement(item)}
                        >
                          <History className="w-3.5 h-3.5" /> Adjust / Movement
                        </Button>
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setShowDeleteItem(item)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                      No items registered under {activeTab}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Ledger History Table */
        <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-foreground">Immutable Stock Movement Audit Trail</h3>
            <span className="text-xs text-muted-foreground">Showing last 100 transactions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Timestamp
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Item
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Type
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Quantity
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                      Loading movements ledger...
                    </td>
                  </tr>
                ) : movements && movements.length > 0 ? (
                  movements.map((m: NonNullable<typeof movements>[number]) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {format(new Date(m.created_at), "MMM d, yyyy HH:mm")}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium">
                        {m.inventory_items?.name || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            m.type === "in"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-amber-500/10 text-amber-700"
                          }`}
                        >
                          {m.type === "in" ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          {m.type === "in" ? "Receipt" : "Dispatched"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold">
                        {m.type === "in" ? "+" : "-"}
                        {Number(m.quantity).toLocaleString()} {m.inventory_items?.unit || ""}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{m.reason || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Register New Asset</DialogTitle>
            <DialogDescription>Add machinery, tools, or consumable warehouse supplies.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="machinery">Machinery</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="consumable">Consumable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input placeholder="e.g. Moisture Meter or Jute Bags" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Initial Quantity</Label>
                <Input type="number" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Input placeholder="e.g. bags, litres, units" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Storage Location</Label>
              <Input placeholder="e.g. Shed B or Mill Storage" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={!name.trim()}>
              Save Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Movement Dialog */}
      <Dialog open={!!showMovement} onOpenChange={(v) => !v && setShowMovement(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Record Inventory Movement</DialogTitle>
            <DialogDescription>
              All stock changes must be recorded in the auditable movement ledger.
            </DialogDescription>
          </DialogHeader>

          {showMovement && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/30 rounded-lg text-xs flex justify-between">
                <span>Current Balance for {showMovement.name}:</span>
                <span className="font-semibold">
                  {Number(showMovement.quantity).toLocaleString()} {showMovement.unit || "units"}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Movement Type</Label>
                <Select value={movementType} onValueChange={(v: "in" | "out") => setMovementType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">Consumption / Dispatch (Stock Decrease)</SelectItem>
                    <SelectItem value="in">Receipt / Purchase (Stock Increase)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity ({showMovement.unit || "units"})</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50"
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Operational Reason / Reference</Label>
                <Input
                  placeholder="e.g. Used for Lot L-2026-0001 or Delivery Note #442"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovement(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordMovement}
              disabled={!movementQty || !reason.trim() || recordMovement.isPending}
            >
              {recordMovement.isPending ? "Recording..." : "Record in Ledger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!showDeleteItem} onOpenChange={(v) => { if (!v) setShowDeleteItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {showDeleteItem?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inventory asset and all associated stock movement records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteItem && deleteItemMutation.mutate(showDeleteItem.id)}
              disabled={deleteItemMutation.isPending}
            >
              {deleteItemMutation.isPending ? "Deleting..." : "Delete Item"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InventoryPage;
