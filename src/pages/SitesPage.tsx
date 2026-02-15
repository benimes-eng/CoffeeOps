import { useState } from "react";
import { MapPin, Plus, Grid3X3, Layers } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import type { Tables } from "@/integrations/supabase/types";

type Site = Tables<"sites">;
type Block = Tables<"blocks"> & { beds_count?: number; occupied_count?: number; maintenance_count?: number };

const SitesPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const [showNewSite, setShowNewSite] = useState(false);
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [showNewBed, setShowNewBed] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteLocation, setNewSiteLocation] = useState("");
  const [newBlockName, setNewBlockName] = useState("");
  // Bulk bed fields
  const [bedPrefix, setBedPrefix] = useState("");
  const [bedCount, setBedCount] = useState("1");
  const [bedStartNum, setBedStartNum] = useState("1");
  const [newBedLength, setNewBedLength] = useState("10");
  const [newBedWidth, setNewBedWidth] = useState("1.2");
  const [newBedMaterial, setNewBedMaterial] = useState("");
  const [selectedBlockIdForBed, setSelectedBlockIdForBed] = useState<string>("");

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("*").order("name");
      if (error) throw error;
      return data as Site[];
    },
  });

  const selectedSite = sites?.find((s) => s.id === selectedSiteId) || sites?.[0];

  const { data: blocks } = useQuery({
    queryKey: ["site-blocks", selectedSite?.id],
    queryFn: async () => {
      if (!selectedSite) return [];
      const { data: blocksData, error } = await supabase
        .from("blocks")
        .select("*")
        .eq("site_id", selectedSite.id)
        .order("name");
      if (error) throw error;

      const blockIds = blocksData.map((b) => b.id);
      const { data: beds } = await supabase.from("beds").select("id, block_id, status").in("block_id", blockIds);

      return blocksData.map((block) => {
        const blockBeds = beds?.filter((b) => b.block_id === block.id) || [];
        return {
          ...block,
          beds_count: blockBeds.length,
          occupied_count: blockBeds.filter((b) => b.status === "occupied").length,
          maintenance_count: blockBeds.filter((b) => b.status === "maintenance").length,
        } as Block;
      });
    },
    enabled: !!selectedSite,
  });

  const createSite = useMutation({
    mutationFn: async () => {
      if (!newSiteName.trim() || !orgId) throw new Error("Site name is required");
      const { error } = await supabase.from("sites").insert({
        name: newSiteName.trim(),
        location: newSiteLocation.trim() || null,
        organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      toast({ title: "Site created" });
      setShowNewSite(false);
      setNewSiteName("");
      setNewSiteLocation("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createBlock = useMutation({
    mutationFn: async () => {
      if (!newBlockName.trim() || !selectedSite || !orgId) throw new Error("Block name is required");
      const { error } = await supabase.from("blocks").insert({
        name: newBlockName.trim(),
        site_id: selectedSite.id,
        organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-blocks"] });
      toast({ title: "Block created" });
      setShowNewBlock(false);
      setNewBlockName("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createBeds = useMutation({
    mutationFn: async () => {
      if (!bedPrefix.trim() || !selectedBlockIdForBed || !orgId) throw new Error("Prefix and block are required");
      const count = Math.min(Math.max(Number(bedCount) || 1, 1), 100);
      const start = Number(bedStartNum) || 1;
      const length = Number(newBedLength) || 10;
      const width = Number(newBedWidth) || 1.2;
      const area = length * width;

      const beds = Array.from({ length: count }, (_, i) => ({
        bed_number: `${bedPrefix.trim()}-${String(start + i).padStart(2, "0")}`,
        block_id: selectedBlockIdForBed,
        length,
        width,
        material_type: newBedMaterial.trim() || null,
        organization_id: orgId,
      }));

      const { error } = await supabase.from("beds").insert(beds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-blocks"] });
      qc.invalidateQueries({ queryKey: ["beds"] });
      toast({ title: `Beds created successfully` });
      closeBedDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeBedDialog = () => {
    setShowNewBed(false);
    setBedPrefix("");
    setBedCount("1");
    setBedStartNum("1");
    setNewBedLength("10");
    setNewBedWidth("1.2");
    setNewBedMaterial("");
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
        <Button onClick={() => setShowNewSite(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Site
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Site List */}
        <div className="space-y-3">
          {sites && sites.length > 0 ? (
            sites.map((site) => (
              <button
                key={site.id}
                onClick={() => setSelectedSiteId(site.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                  selectedSite?.id === site.id
                    ? "bg-card border-primary/30 card-shadow"
                    : "bg-card/50 border-border/50 hover:bg-card hover:card-shadow"
                }`}
              >
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
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No sites yet. Create one to get started.</p>
          )}
        </div>

        {/* Blocks */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSite ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl">{selectedSite.name} — Blocks</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewBlock(true)} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Block
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowNewBed(true); setSelectedBlockIdForBed(blocks?.[0]?.id || ""); }} className="gap-1.5" disabled={!blocks?.length}>
                    <Layers className="w-3.5 h-3.5" /> Beds
                  </Button>
                </div>
              </div>

              {blocks && blocks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {blocks.map((block) => {
                    const emptyCount = (block.beds_count || 0) - (block.occupied_count || 0) - (block.maintenance_count || 0);
                    const pct = block.beds_count ? ((block.occupied_count || 0) / block.beds_count) * 100 : 0;
                    return (
                      <div key={block.id} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-serif text-lg">{block.name}</h4>
                          <span className="text-xs font-mono text-muted-foreground">{block.beds_count} beds</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Occupied</span>
                            <span className="font-medium text-foreground">{block.occupied_count}</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Empty</span>
                            <span className="font-medium">{emptyCount}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Maintenance</span>
                            <span className="font-medium text-destructive">{block.maintenance_count}</span>
                          </div>
                        </div>
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
            <div className="space-y-2">
              <Label>Site Name</Label>
              <Input placeholder="e.g. Nyeri Estate" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Input placeholder="e.g. Nyeri, Kenya" value={newSiteLocation} onChange={(e) => setNewSiteLocation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSite(false)}>Cancel</Button>
            <Button onClick={() => createSite.mutate()} disabled={createSite.isPending}>
              {createSite.isPending ? "Creating..." : "Create Site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Block Dialog */}
      <Dialog open={showNewBlock} onOpenChange={setShowNewBlock}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">New Block</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Block Name</Label>
              <Input placeholder="e.g. Block A" value={newBlockName} onChange={(e) => setNewBlockName(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">Adding to: {selectedSite?.name}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBlock(false)}>Cancel</Button>
            <Button onClick={() => createBlock.mutate()} disabled={createBlock.isPending}>
              {createBlock.isPending ? "Creating..." : "Create Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Bed Creation Dialog */}
      <Dialog open={showNewBed} onOpenChange={(v) => !v && closeBedDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-serif">Create Beds</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Block</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedBlockIdForBed}
                onChange={(e) => setSelectedBlockIdForBed(e.target.value)}
              >
                {blocks?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Prefix</Label>
                <Input placeholder="e.g. A" value={bedPrefix} onChange={(e) => setBedPrefix(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Start #</Label>
                <Input type="number" min="1" value={bedStartNum} onChange={(e) => setBedStartNum(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Count</Label>
                <Input type="number" min="1" max="100" value={bedCount} onChange={(e) => setBedCount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Length (m)</Label>
                <Input type="number" value={newBedLength} onChange={(e) => setNewBedLength(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Width (m)</Label>
                <Input type="number" value={newBedWidth} onChange={(e) => setNewBedWidth(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Material (optional)</Label>
              <Input placeholder="e.g. Raised wire mesh" value={newBedMaterial} onChange={(e) => setNewBedMaterial(e.target.value)} />
            </div>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Preview ({previewCount} beds)</p>
              <p className="text-sm font-mono">
                {previewNames.join(", ")}{previewCount > 5 ? `, ... ${bedPrefix || "X"}-${String(previewStart + previewCount - 1).padStart(2, "0")}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Each: {((Number(newBedLength) || 0) * (Number(newBedWidth) || 0)).toFixed(1)} m²
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeBedDialog}>Cancel</Button>
            <Button onClick={() => createBeds.mutate()} disabled={createBeds.isPending} className="gap-2">
              <Layers className="w-4 h-4" />
              {createBeds.isPending ? "Creating..." : `Create ${previewCount} Bed(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SitesPage;
