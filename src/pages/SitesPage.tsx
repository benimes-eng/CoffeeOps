import { useState } from "react";
import { MapPin, Plus, Grid3X3, Layers, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { useRole } from "@/hooks/use-role";
import type { Tables } from "@/integrations/supabase/types";

type Site = Tables<"sites">;
type Bed = Tables<"beds">;
type Block = Tables<"blocks"> & { beds_count?: number; occupied_count?: number; maintenance_count?: number; beds?: Bed[] };

const SitesPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const { isOwner } = useRole();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  // Dialogs
  const [showNewSite, setShowNewSite] = useState(false);
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [showEditBlock, setShowEditBlock] = useState<Block | null>(null);
  const [showDeleteBlock, setShowDeleteBlock] = useState<Block | null>(null);
  const [showNewBed, setShowNewBed] = useState(false);
  const [showEditSite, setShowEditSite] = useState<Site | null>(null);
  const [showDeleteSite, setShowDeleteSite] = useState<Site | null>(null);
  const [showEditBed, setShowEditBed] = useState<Bed | null>(null);
  const [showDeleteBed, setShowDeleteBed] = useState<Bed | null>(null);

  // Form state
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteLocation, setNewSiteLocation] = useState("");
  const [newBlockName, setNewBlockName] = useState("");
  const [editBlockName, setEditBlockName] = useState("");
  const [bedPrefix, setBedPrefix] = useState("");
  const [bedCount, setBedCount] = useState("1");
  const [bedStartNum, setBedStartNum] = useState("1");
  const [newBedLength, setNewBedLength] = useState("10");
  const [newBedWidth, setNewBedWidth] = useState("1.2");
  const [newBedMaterial, setNewBedMaterial] = useState("");
  const [selectedBlockIdForBed, setSelectedBlockIdForBed] = useState<string>("");

  // Edit bed form
  const [editBedLength, setEditBedLength] = useState("");
  const [editBedWidth, setEditBedWidth] = useState("");
  const [editBedMaterial, setEditBedMaterial] = useState("");

  const { data: sites } = useQuery({
    queryKey: ["sites", orgId],
    queryFn: async () => {
      const query = supabase.from("sites").select("*").order("name");
      if (orgId) query.eq("organization_id", orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Site[];
    },
    enabled: !!orgId,
  });


  const selectedSite = sites?.find((s) => s.id === selectedSiteId) || sites?.[0];

  const { data: blocks } = useQuery({
    queryKey: ["site-blocks", selectedSite?.id],
    queryFn: async () => {
      if (!selectedSite) return [];
      const { data: blocksData, error } = await supabase.from("blocks").select("*").eq("site_id", selectedSite.id).order("name");
      if (error) throw error;
      const blockIds = blocksData.map((b) => b.id);
      const { data: beds } = await supabase.from("beds").select("id, block_id, status, bed_number, length, width, material_type").in("block_id", blockIds);
      return blocksData.map((block) => {
        const blockBeds = beds?.filter((b) => b.block_id === block.id) || [];
        return {
          ...block,
          beds_count: blockBeds.length,
          occupied_count: blockBeds.filter((b) => b.status === "occupied").length,
          maintenance_count: blockBeds.filter((b) => b.status === "maintenance").length,
          beds: blockBeds,
        } as Block;
      });
    },
    enabled: !!selectedSite,
  });

  // CRUD Mutations
  const createSite = useMutation({
    mutationFn: async () => {
      if (!newSiteName.trim() || !orgId) throw new Error("Site name is required");
      const { error } = await supabase.from("sites").insert({ name: newSiteName.trim(), location: newSiteLocation.trim() || null, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sites"] }); toast({ title: "Site created" }); setShowNewSite(false); setNewSiteName(""); setNewSiteLocation(""); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editSite = useMutation({
    mutationFn: async () => {
      if (!showEditSite || !newSiteName.trim()) throw new Error("Required");
      const { error } = await supabase.from("sites").update({ name: newSiteName.trim(), location: newSiteLocation.trim() || null }).eq("id", showEditSite.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sites"] }); toast({ title: "Site updated" }); setShowEditSite(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSite = useMutation({
    mutationFn: async () => {
      if (!showDeleteSite) throw new Error("No site");
      const { error } = await supabase.from("sites").delete().eq("id", showDeleteSite.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sites"] }); toast({ title: "Site deleted" }); setShowDeleteSite(null); setSelectedSiteId(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  const createBlock = useMutation({
    mutationFn: async () => {
      if (!newBlockName.trim() || !selectedSite || !orgId) throw new Error("Block name is required");
      const { error } = await supabase.from("blocks").insert({ name: newBlockName.trim(), site_id: selectedSite.id, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); toast({ title: "Block created" }); setShowNewBlock(false); setNewBlockName(""); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateBlock = useMutation({
    mutationFn: async () => {
      if (!showEditBlock || !editBlockName.trim()) throw new Error("Block name is required");
      const { error } = await supabase.from("blocks").update({ name: editBlockName.trim() }).eq("id", showEditBlock.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); toast({ title: "Block updated" }); setShowEditBlock(null); setEditBlockName(""); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBlock = useMutation({
    mutationFn: async () => {
      if (!showDeleteBlock) throw new Error("No block selected");
      const { error } = await supabase.from("blocks").delete().eq("id", showDeleteBlock.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); toast({ title: "Block deleted" }); setShowDeleteBlock(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createBeds = useMutation({
    mutationFn: async () => {
      if (!bedPrefix.trim() || !selectedBlockIdForBed || !orgId) throw new Error("Prefix and block are required");
      const count = Math.min(Math.max(Number(bedCount) || 1, 1), 100);
      const start = Number(bedStartNum) || 1;
      const length = Number(newBedLength) || 10;
      const width = Number(newBedWidth) || 1.2;
      const beds = Array.from({ length: count }, (_, i) => ({
        bed_number: `${bedPrefix.trim()}-${String(start + i).padStart(2, "0")}`,
        block_id: selectedBlockIdForBed, length, width,
        material_type: newBedMaterial.trim() || null, organization_id: orgId,
      }));
      const { error } = await supabase.from("beds").insert(beds);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); qc.invalidateQueries({ queryKey: ["beds"] }); toast({ title: "Beds created" }); closeBedDialog(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateBed = useMutation({
    mutationFn: async () => {
      if (!showEditBed) throw new Error("No bed");
      const { error } = await supabase.from("beds").update({
        length: Number(editBedLength) || 10,
        width: Number(editBedWidth) || 1.2,
        material_type: editBedMaterial.trim() || null,
      }).eq("id", showEditBed.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); toast({ title: "Bed updated" }); setShowEditBed(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBed = useMutation({
    mutationFn: async () => {
      if (!showDeleteBed) throw new Error("No bed");
      const { error } = await supabase.from("beds").delete().eq("id", showDeleteBed.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-blocks"] }); qc.invalidateQueries({ queryKey: ["beds"] }); toast({ title: "Bed deleted" }); setShowDeleteBed(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeBedDialog = () => {
    setShowNewBed(false); setBedPrefix(""); setBedCount("1"); setBedStartNum("1");
    setNewBedLength("10"); setNewBedWidth("1.2"); setNewBedMaterial("");
  };

  const previewCount = Math.min(Math.max(Number(bedCount) || 1, 1), 100);
  const previewStart = Number(bedStartNum) || 1;
  const previewNames = Array.from({ length: Math.min(previewCount, 5) }, (_, i) =>
    `${bedPrefix || "X"}-${String(previewStart + i).padStart(2, "0")}`
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Sites & Fields</h1>
          <p className="text-muted-foreground mt-1">Manage farm sites, blocks, and beds</p>
        </div>
        {isOwner && (
          <Button onClick={() => setShowNewSite(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Site
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Site List */}
        <div className="space-y-3">
          {sites && sites.length > 0 ? sites.map((site) => (
            <div key={site.id} className={`relative group w-full text-left p-4 rounded-xl border transition-all duration-150 ${selectedSite?.id === site.id ? "bg-card border-primary/30 card-shadow" : "bg-card/50 border-border/50 hover:bg-card hover:card-shadow"}`}>
              <button onClick={() => setSelectedSiteId(site.id)} className="w-full text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{site.name}</p>
                    <p className="text-sm text-muted-foreground">{site.location || "No location"}</p>
                  </div>
                </div>
              </button>
              {isOwner && (
                <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowEditSite(site); setNewSiteName(site.name); setNewSiteLocation(site.location || ""); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setShowDeleteSite(site)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No sites yet. Create one to get started.</p>
          )}
        </div>

        {/* Blocks & Beds */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSite ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl">{selectedSite.name} — Blocks</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewBlock(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Block</Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowNewBed(true); setSelectedBlockIdForBed(blocks?.[0]?.id || ""); }} className="gap-1.5" disabled={!blocks?.length}><Layers className="w-3.5 h-3.5" /> Beds</Button>
                </div>
              </div>
              {blocks && blocks.length > 0 ? (
                <div className="space-y-4">
                  {blocks.map((block) => {
                    const emptyCount = (block.beds_count || 0) - (block.occupied_count || 0) - (block.maintenance_count || 0);
                    const pct = block.beds_count ? ((block.occupied_count || 0) / block.beds_count) * 100 : 0;
                    return (
                      <div key={block.id} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <h4 className="font-sans font-bold text-base text-foreground">{block.name}</h4>
                            <span className="text-xs font-mono text-muted-foreground">({block.beds_count} beds)</span>
                          </div>
                          {isOwner && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setShowEditBlock(block);
                                  setEditBlockName(block.name);
                                }}
                                title="Edit Block"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => setShowDeleteBlock(block)}
                                title="Delete Block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Occupied</span><span className="font-medium">{block.occupied_count}</span></div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Empty</span><span className="font-medium">{emptyCount}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Maintenance</span><span className="font-medium text-destructive">{block.maintenance_count}</span></div>
                        </div>
                        {/* Beds list */}
                        {block.beds && block.beds.length > 0 && (
                          <div className="border-t border-border/50 pt-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Beds</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {block.beds.map((bed: Bed) => (
                                <div key={bed.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm group/bed">
                                  <span className="font-mono text-xs">{bed.bed_number}</span>
                                  {isOwner && (
                                    <div className="hidden group-hover/bed:flex gap-1">
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowEditBed(bed); setEditBedLength(String(bed.length)); setEditBedWidth(String(bed.width)); setEditBedMaterial(bed.material_type || ""); }}>
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setShowDeleteBed(bed)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No blocks yet. Add a block to this site.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Select a site to view its blocks.</p>
          )}
        </div>
      </div>

      {/* New Site Dialog */}
      <Dialog open={showNewSite} onOpenChange={setShowNewSite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">New Site</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Site Name</Label><Input placeholder="e.g. Yirgacheffe Estate" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Location (optional)</Label><Input placeholder="e.g. Sidama, Ethiopia" value={newSiteLocation} onChange={(e) => setNewSiteLocation(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSite(false)}>Cancel</Button>
            <Button onClick={() => createSite.mutate()} disabled={createSite.isPending}>{createSite.isPending ? "Creating..." : "Create Site"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Site Dialog */}
      <Dialog open={!!showEditSite} onOpenChange={(v) => { if (!v) setShowEditSite(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Edit Site</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Site Name</Label><Input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Location</Label><Input value={newSiteLocation} onChange={(e) => setNewSiteLocation(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditSite(null)}>Cancel</Button>
            <Button onClick={() => editSite.mutate()} disabled={editSite.isPending}>{editSite.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Site Confirmation */}
      <AlertDialog open={!!showDeleteSite} onOpenChange={(v) => { if (!v) setShowDeleteSite(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{showDeleteSite?.name}"? This will also delete all blocks and beds in this site. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSite.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Block Dialog */}
      <Dialog open={showNewBlock} onOpenChange={setShowNewBlock}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-sans font-bold text-lg">New Block</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Block Name</Label><Input placeholder="e.g. Block A" value={newBlockName} onChange={(e) => setNewBlockName(e.target.value)} /></div>
            <p className="text-sm text-muted-foreground">Adding to: {selectedSite?.name}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBlock(false)}>Cancel</Button>
            <Button onClick={() => createBlock.mutate()} disabled={createBlock.isPending}>{createBlock.isPending ? "Creating..." : "Create Block"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Block Dialog */}
      <Dialog open={!!showEditBlock} onOpenChange={(v) => { if (!v) setShowEditBlock(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-sans font-bold text-lg">Edit Block</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Block Name</Label><Input value={editBlockName} onChange={(e) => setEditBlockName(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBlock(null)}>Cancel</Button>
            <Button onClick={() => updateBlock.mutate()} disabled={updateBlock.isPending}>{updateBlock.isPending ? "Saving..." : "Save Block"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Block Confirmation */}
      <AlertDialog open={!!showDeleteBlock} onOpenChange={(v) => { if (!v) setShowDeleteBlock(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Block</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete block "{showDeleteBlock?.name}"? All associated drying beds will also be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBlock.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Block</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Bed Creation Dialog */}
      <Dialog open={showNewBed} onOpenChange={(v) => !v && closeBedDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Create Beds</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Block</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedBlockIdForBed} onChange={(e) => setSelectedBlockIdForBed(e.target.value)}>
                {blocks?.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Prefix</Label><Input placeholder="e.g. A" value={bedPrefix} onChange={(e) => setBedPrefix(e.target.value)} /></div>
              <div className="space-y-2"><Label>Start #</Label><Input type="number" min="1" value={bedStartNum} onChange={(e) => setBedStartNum(e.target.value)} /></div>
              <div className="space-y-2"><Label>Count</Label><Input type="number" min="1" max="100" value={bedCount} onChange={(e) => setBedCount(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Length (m)</Label><Input type="number" value={newBedLength} onChange={(e) => setNewBedLength(e.target.value)} /></div>
              <div className="space-y-2"><Label>Width (m)</Label><Input type="number" value={newBedWidth} onChange={(e) => setNewBedWidth(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Material (optional)</Label><Input placeholder="e.g. Raised wire mesh" value={newBedMaterial} onChange={(e) => setNewBedMaterial(e.target.value)} /></div>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Preview ({previewCount} beds)</p>
              <p className="text-sm font-mono">{previewNames.join(", ")}{previewCount > 5 ? `, ... ${bedPrefix || "X"}-${String(previewStart + previewCount - 1).padStart(2, "0")}` : ""}</p>
              <p className="text-xs text-muted-foreground">Each: {((Number(newBedLength) || 0) * (Number(newBedWidth) || 0)).toFixed(1)} m²</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeBedDialog}>Cancel</Button>
            <Button onClick={() => createBeds.mutate()} disabled={createBeds.isPending} className="gap-2"><Layers className="w-4 h-4" />{createBeds.isPending ? "Creating..." : `Create ${previewCount} Bed(s)`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bed Dialog */}
      <Dialog open={!!showEditBed} onOpenChange={(v) => { if (!v) setShowEditBed(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Edit Bed {showEditBed?.bed_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Length (m)</Label><Input type="number" value={editBedLength} onChange={(e) => setEditBedLength(e.target.value)} /></div>
              <div className="space-y-2"><Label>Width (m)</Label><Input type="number" value={editBedWidth} onChange={(e) => setEditBedWidth(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Material</Label><Input value={editBedMaterial} onChange={(e) => setEditBedMaterial(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBed(null)}>Cancel</Button>
            <Button onClick={() => updateBed.mutate()} disabled={updateBed.isPending}>{updateBed.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Bed Confirmation */}
      <AlertDialog open={!!showDeleteBed} onOpenChange={(v) => { if (!v) setShowDeleteBed(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bed</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete bed "{showDeleteBed?.bed_number}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBed.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SitesPage;
