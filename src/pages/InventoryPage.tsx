import { useState } from "react";
import { Plus, Wrench, Package, Droplets, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";

const tabs = [
  { id: "machinery", label: "Machinery", icon: Wrench },
  { id: "equipment", label: "Equipment", icon: Package },
  { id: "consumable", label: "Consumables", icon: Droplets },
] as const;

const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState<string>("machinery");
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [showDelete, setShowDelete] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();

  // Form fields
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<string>("machinery");

  const { data: items, isLoading } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filteredItems = items?.filter((i) => i.category === activeTab) || [];

  const resetForm = () => { setName(""); setQuantity("1"); setUnit(""); setLocation(""); setCategory(activeTab); };

  const addItem = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !orgId) throw new Error("Name is required");
      const { error } = await supabase.from("inventory_items").insert({
        name: name.trim(), quantity: Number(quantity) || 0,
        unit: unit.trim() || null, location: location.trim() || null,
        category: category as any, organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-items"] }); toast({ title: "Item added" }); setShowAdd(false); resetForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editItem = useMutation({
    mutationFn: async () => {
      if (!showEdit) throw new Error("No item");
      const { error } = await supabase.from("inventory_items").update({
        name: name.trim(), quantity: Number(quantity) || 0,
        unit: unit.trim() || null, location: location.trim() || null,
      }).eq("id", showEdit.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-items"] }); toast({ title: "Item updated" }); setShowEdit(null); resetForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async () => {
      if (!showDelete) throw new Error("No item");
      const { error } = await supabase.from("inventory_items").delete().eq("id", showDelete.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory-items"] }); toast({ title: "Item deleted" }); setShowDelete(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Inventory & Machinery</h1>
          <p className="text-muted-foreground mt-1">Track equipment and consumables</p>
        </div>
        <Button onClick={() => { setCategory(activeTab); setShowAdd(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? "bg-card text-foreground card-shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Updated</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium">{item.name}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(item.quantity)}</td>
                    <td className="px-5 py-3.5 text-sm">{item.unit || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">{item.location || "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{format(new Date(item.updated_at), "MMM dd, yyyy")}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowEdit(item); setName(item.name); setQuantity(String(item.quantity)); setUnit(item.unit || ""); setLocation(item.location || ""); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setShowDelete(item)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No items in this category. Click "Add Item" to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Add Inventory Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g. Moisture Meter" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="machinery">Machinery</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="consumable">Consumable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
              <div className="space-y-2"><Label>Unit</Label><Input placeholder="e.g. pcs, kg" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Storage Location</Label><Input placeholder="e.g. Warehouse A" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => addItem.mutate()} disabled={addItem.isPending}>{addItem.isPending ? "Adding..." : "Add Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!showEdit} onOpenChange={(v) => { if (!v) { setShowEdit(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Edit Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
              <div className="space-y-2"><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEdit(null); resetForm(); }}>Cancel</Button>
            <Button onClick={() => editItem.mutate()} disabled={editItem.isPending}>{editItem.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDelete} onOpenChange={(v) => { if (!v) setShowDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{showDelete?.name}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InventoryPage;
