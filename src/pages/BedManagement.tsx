import { useState, useMemo } from "react";
import { useSites, useBlocks, useBeds, useBedActions } from "@/hooks/useBedManagement";
import { BedWithDetails, getBedStatusColor, getDryingDays } from "@/services/bedService";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BedCard } from "@/components/beds/BedCard";
import { BedDetailPanel } from "@/components/beds/BedDetailPanel";
import { SmartAssignmentDialog } from "@/components/beds/SmartAssignmentDialog";
import { BatchView } from "@/components/beds/BatchView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Layers,
  Maximize,
  Weight,
  BarChart3,
  Package,
  Wrench,
  Plus,
  LayoutGrid,
  List,
  Settings2,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  red: "Days 0-3",
  yellow: "Active Drying",
  green: "Finished",
  grey: "Empty",
  black: "Maintenance",
};

const statusDots: Record<string, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
  grey: "bg-status-grey",
  black: "bg-status-black",
};

const BedManagement = () => {
  const [siteId, setSiteId] = useState<string>("");
  const [blockFilter, setBlockFilter] = useState<string>("");
  const [density, setDensity] = useState(30);
  const [selectedBed, setSelectedBed] = useState<BedWithDetails | null>(null);
  const [showAssignment, setShowAssignment] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "batch">("grid");
  const [showDensityConfig, setShowDensityConfig] = useState(false);

  const { data: sites } = useSites();
  const { data: blocks } = useBlocks(siteId || undefined);
  const { data: beds, isLoading } = useBeds(siteId || undefined, blockFilter || undefined);

  // Metrics
  const metrics = useMemo(() => {
    if (!beds) return null;
    const totalBeds = beds.length;
    const totalArea = beds.reduce((s, b) => s + Number(b.surface_area ?? Number(b.length) * Number(b.width)), 0);
    const totalCapacity = totalArea * density;
    const occupiedBeds = beds.filter((b) => b.status === "occupied");
    const usedWeight = occupiedBeds.reduce((s, b) => s + Number(b.active_assignment?.assigned_weight || 0), 0);
    const utilization = totalCapacity > 0 ? Math.round((usedWeight / totalCapacity) * 100) : 0;
    const availableCapacity = totalCapacity - usedWeight;
    const maintenanceBeds = beds.filter((b) => b.status === "maintenance").length;
    return { totalBeds, totalArea, totalCapacity, utilization, availableCapacity, maintenanceBeds };
  }, [beds, density]);

  // Group beds by block
  const bedsByBlock = useMemo(() => {
    if (!beds) return [];
    const map = new Map<string, { blockName: string; beds: BedWithDetails[] }>();
    beds.forEach((bed) => {
      const key = bed.block_id;
      if (!map.has(key)) {
        map.set(key, { blockName: bed.block?.name || "Unknown Block", beds: [] });
      }
      map.get(key)!.beds.push(bed);
    });
    return Array.from(map.values()).sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [beds]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Bed Management</h1>
          <p className="text-muted-foreground mt-1">Drying command center</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAssignment(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Assign Lot
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={siteId} onValueChange={(v) => { setSiteId(v === "all" ? "" : v); setBlockFilter(""); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={blockFilter} onValueChange={(v) => setBlockFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Blocks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Blocks</SelectItem>
            {blocks?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Button
            variant={showDensityConfig ? "default" : "outline"}
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowDensityConfig(!showDensityConfig)}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          {showDensityConfig && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value) || 30)}
                className="w-20 h-9 text-sm"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">KG/m²</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex gap-1">
          <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === "batch" ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => setViewMode("batch")}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard title="Total Beds" value={metrics.totalBeds} icon={<Layers className="w-4 h-4" />} />
          <MetricCard title="Surface Area" value={`${metrics.totalArea.toFixed(0)} m²`} icon={<Maximize className="w-4 h-4" />} />
          <MetricCard title="Drying Capacity" value={`${metrics.totalCapacity.toFixed(0)} KG`} icon={<Weight className="w-4 h-4" />} />
          <MetricCard title="Utilization" value={`${metrics.utilization}%`} icon={<BarChart3 className="w-4 h-4" />} />
          <MetricCard title="Available" value={`${metrics.availableCapacity.toFixed(0)} KG`} icon={<Package className="w-4 h-4" />} />
          <MetricCard title="Maintenance" value={metrics.maintenanceBeds} icon={<Wrench className="w-4 h-4" />} />
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${statusDots[key]}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading beds...</div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        bedsByBlock.length > 0 ? (
          bedsByBlock.map(({ blockName, beds: blockBeds }) => (
            <div key={blockName} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
              <h3 className="font-serif text-lg mb-4">{blockName}</h3>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                {blockBeds.map((bed) => (
                  <BedCard key={bed.id} bed={bed} onClick={setSelectedBed} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            No beds found. Add sites, blocks, and beds from the Sites & Fields page.
          </div>
        )
      ) : (
        /* Batch View */
        <BatchView beds={beds || []} />
      )}

      {/* Side Panel */}
      <BedDetailPanel bed={selectedBed} open={!!selectedBed} onClose={() => setSelectedBed(null)} density={density} />

      {/* Smart Assignment */}
      <SmartAssignmentDialog
        open={showAssignment}
        onClose={() => setShowAssignment(false)}
        siteId={siteId || undefined}
        density={density}
      />
    </div>
  );
};

export default BedManagement;
