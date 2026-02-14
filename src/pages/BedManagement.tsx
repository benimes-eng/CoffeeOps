import { useState, useMemo } from "react";
import {
  Layers, Activity, Package, Wrench, Grid3X3, List, Plus, Settings2,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import {
  useBedsWithAssignments, useSites, useBlocks,
  type BedWithAssignment, getDryingColor,
} from "@/hooks/use-beds";
import { BedDetailPanel } from "@/components/beds/BedDetailPanel";
import { SmartAssignment } from "@/components/beds/SmartAssignment";
import { BatchView } from "@/components/beds/BatchView";

const BedManagement = () => {
  const [siteId, setSiteId] = useState<string>("");
  const [blockId, setBlockId] = useState<string>("");
  const [density, setDensity] = useState(30);
  const [viewMode, setViewMode] = useState<"grid" | "batch">("grid");
  const [selectedBed, setSelectedBed] = useState<BedWithAssignment | null>(null);
  const [showAssignment, setShowAssignment] = useState(false);
  const [showDensityConfig, setShowDensityConfig] = useState(false);

  const { data: sites } = useSites();
  const { data: blocks } = useBlocks(siteId || undefined);
  const { data: beds, isLoading } = useBedsWithAssignments(siteId || undefined, blockId || undefined);

  // KPI calculations
  const kpis = useMemo(() => {
    if (!beds) return null;
    const totalBeds = beds.length;
    const totalArea = beds.reduce((s, b) => s + (b.surface_area ?? 0), 0);
    const totalCapacity = totalArea * density;
    const occupiedBeds = beds.filter((b) => b.status === "occupied");
    const usedArea = occupiedBeds.reduce((s, b) => s + (b.surface_area ?? 0), 0);
    const usedCapacity = usedArea * density;
    const utilization = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
    const available = totalCapacity - usedCapacity;
    const maintenance = beds.filter((b) => b.status === "maintenance").length;
    return { totalBeds, totalArea, totalCapacity, utilization, available, maintenance };
  }, [beds, density]);

  // Group beds by block for grid view
  const bedsByBlock = useMemo(() => {
    if (!beds) return [];
    const map = new Map<string, { blockName: string; siteName: string; beds: BedWithAssignment[] }>();
    beds.forEach((bed) => {
      const key = bed.block_id;
      if (!map.has(key)) {
        map.set(key, { blockName: bed.blocks.name, siteName: bed.blocks.sites.name, beds: [] });
      }
      map.get(key)!.beds.push(bed);
    });
    return Array.from(map.values()).sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [beds]);

  // Status legend
  const legend = [
    { label: "Empty", bg: "bg-status-grey" },
    { label: "Day 0-3", bg: "bg-status-red" },
    { label: "Active Drying", bg: "bg-status-yellow" },
    { label: "Finished", bg: "bg-status-green" },
    { label: "Maintenance", bg: "bg-status-black" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Bed Management</h1>
          <p className="text-muted-foreground mt-1">Drying command center</p>
        </div>
        <button
          onClick={() => setShowAssignment(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity self-start"
        >
          <Plus className="w-4 h-4" />
          New Assignment
        </button>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard title="Total Beds" value={kpis.totalBeds} icon={<Grid3X3 className="w-4 h-4" />} />
          <MetricCard title="Surface Area" value={`${kpis.totalArea} m²`} icon={<Layers className="w-4 h-4" />} />
          <MetricCard title="Capacity" value={`${kpis.totalCapacity.toLocaleString()} KG`} icon={<Package className="w-4 h-4" />} />
          <MetricCard title="Utilization" value={`${kpis.utilization}%`} icon={<Activity className="w-4 h-4" />} />
          <MetricCard title="Available" value={`${kpis.available.toLocaleString()} KG`} icon={<Package className="w-4 h-4" />} />
          <MetricCard title="Maintenance" value={kpis.maintenance} icon={<Wrench className="w-4 h-4" />} />
        </div>
      )}

      {/* Filters & Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={siteId}
          onChange={(e) => { setSiteId(e.target.value); setBlockId(""); }}
          className="px-3 py-2 bg-card border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Sites</option>
          {sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          value={blockId}
          onChange={(e) => setBlockId(e.target.value)}
          className="px-3 py-2 bg-card border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Blocks</option>
          {blocks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {/* Density Config */}
        <div className="relative">
          <button
            onClick={() => setShowDensityConfig(!showDensityConfig)}
            className="flex items-center gap-1.5 px-3 py-2 bg-card border border-input rounded-lg text-sm hover:bg-muted transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {density} KG/m²
          </button>
          {showDensityConfig && (
            <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg p-3 card-shadow z-20 w-48">
              <label className="text-xs text-muted-foreground font-medium">Drying Density</label>
              <input
                type="number"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value) || 30)}
                className="w-full mt-1 px-2 py-1.5 bg-background border border-input rounded text-sm"
                min={10}
                max={100}
              />
              <button
                onClick={() => setShowDensityConfig(false)}
                className="w-full mt-2 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <div className="ml-auto flex bg-muted p-0.5 rounded-lg">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "grid" ? "bg-card text-foreground card-shadow" : "text-muted-foreground"
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" /> Grid
          </button>
          <button
            onClick={() => setViewMode("batch")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "batch" ? "bg-card text-foreground card-shadow" : "text-muted-foreground"
            }`}
          >
            <List className="w-3.5 h-3.5" /> Batch
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${l.bg}`} />
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading beds...</div>
      ) : viewMode === "grid" ? (
        <div className="space-y-6">
          {bedsByBlock.map((group) => (
            <div key={group.blockName} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-serif text-lg">{group.blockName}</h3>
                  <p className="text-xs text-muted-foreground">{group.siteName} · {group.beds.length} beds</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {group.beds.filter((b) => b.status === "occupied").length} occupied · {group.beds.filter((b) => b.status === "empty").length} empty
                </div>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                {group.beds.map((bed) => {
                  const color = getDryingColor(bed.dryingPhase);
                  return (
                    <button
                      key={bed.id}
                      onClick={() => setSelectedBed(bed)}
                      className={`relative rounded-lg ${color.bg} ${color.text} p-2 flex flex-col items-center justify-center aspect-square hover:opacity-80 transition-all cursor-pointer group`}
                      title={`${bed.bed_number} · ${bed.surface_area} m² · ${color.label}`}
                    >
                      <span className="text-[11px] font-bold font-mono">{bed.bed_number}</span>
                      <span className="text-[9px] opacity-80">{bed.surface_area}m²</span>
                      {bed.activeAssignment && (
                        <span className="text-[8px] opacity-70">{bed.activeAssignment.assigned_weight}kg</span>
                      )}
                      {bed.dryingDays !== undefined && bed.dryingDays >= 0 && (
                        <span className="text-[8px] opacity-70">D{bed.dryingDays}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {bedsByBlock.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No beds found. Create sites and blocks first, then add beds.
            </div>
          )}
        </div>
      ) : (
        <BatchView beds={beds ?? []} onSelectBed={setSelectedBed} />
      )}

      {/* Detail Panel */}
      {selectedBed && (
        <BedDetailPanel bed={selectedBed} onClose={() => setSelectedBed(null)} />
      )}

      {/* Smart Assignment Dialog */}
      {showAssignment && (
        <SmartAssignment density={density} onClose={() => setShowAssignment(false)} />
      )}
    </div>
  );
};

export default BedManagement;
