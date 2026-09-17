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

  const [searchLot, setSearchLot] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
    return { totalBeds, totalArea, totalCapacity, utilization, availableCapacity, maintenanceBeds, occupiedCount: occupiedBeds.length };
  }, [beds, density]);

  // Filtered beds
  const filteredBeds = useMemo(() => {
    if (!beds) return [];
    return beds.filter((bed) => {
      // Status filter
      if (statusFilter === "occupied" && bed.status !== "occupied") return false;
      if (statusFilter === "empty" && bed.status !== "empty") return false;
      if (statusFilter === "maintenance" && bed.status !== "maintenance") return false;
      if (statusFilter === "critical") {
        const days = bed.active_assignment ? getDryingDays(bed.active_assignment.assigned_date) : 99;
        if (bed.status !== "occupied" || days > 3) return false;
      }
      // Search filter
      if (searchLot.trim()) {
        const q = searchLot.toLowerCase();
        const lotNum = bed.active_assignment?.lot?.lot_number?.toLowerCase() || "";
        const bedNum = bed.bed_number?.toLowerCase() || "";
        if (!lotNum.includes(q) && !bedNum.includes(q)) return false;
      }
      return true;
    });
  }, [beds, statusFilter, searchLot]);

  // Group beds by block
  const bedsByBlock = useMemo(() => {
    const map = new Map<string, { blockName: string; beds: BedWithDetails[] }>();
    filteredBeds.forEach((bed) => {
      const key = bed.block_id;
      if (!map.has(key)) {
        map.set(key, { blockName: bed.block?.name || "Standard Block", beds: [] });
      }
      map.get(key)!.beds.push(bed);
    });
    return Array.from(map.values()).sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [filteredBeds]);

  return (
    <div className="space-y-6">
      {/* Formal Agribusiness Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
            <span>Wet Mill Post-Harvest</span>
            <span>/</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Raised African Drying Beds</span>
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-foreground">
            Drying Operations & Bed Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time moisture progression, turning schedules, and surface area loading telemetry
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button onClick={() => setShowAssignment(true)} className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs h-9 shadow-sm">
            <Plus className="w-4 h-4" /> Stage Coffee Lot
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard title="Raised Beds" value={metrics.totalBeds} subtitle={`${metrics.occupiedCount} currently active`} icon={<Layers className="w-4 h-4" />} />
          <MetricCard title="Total Surface Area" value={`${metrics.totalArea.toFixed(0)} m²`} subtitle="Aerated wire mesh" icon={<Maximize className="w-4 h-4" />} />
          <MetricCard title="Field Capacity" value={`${(metrics.totalCapacity / 1000).toFixed(1)} T`} subtitle={`At ${density} KG/m²`} icon={<Weight className="w-4 h-4" />} />
          <MetricCard title="Field Utilization" value={`${metrics.utilization}%`} trend={metrics.utilization > 75 ? "up" : "neutral"} trendValue="Active" icon={<BarChart3 className="w-4 h-4" />} />
          <MetricCard title="Unallocated" value={`${(metrics.availableCapacity / 1000).toFixed(1)} T`} subtitle="Ready for harvest" icon={<Package className="w-4 h-4" />} />
          <MetricCard title="Beds Offline" value={metrics.maintenanceBeds} subtitle="Repairs / mesh triage" icon={<Wrench className="w-4 h-4" />} />
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-card p-3 rounded-lg border border-border/80 shadow-sm flex flex-wrap items-center gap-3">
        <Select value={siteId} onValueChange={(v) => { setSiteId(v === "all" ? "" : v); setBlockFilter(""); }}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <SelectValue placeholder="All Washing Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Washing Sites</SelectItem>
            {sites?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={blockFilter} onValueChange={(v) => setBlockFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-9 text-xs">
            <SelectValue placeholder="All Blocks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Blocks</SelectItem>
            {blocks?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quick Status Filters */}
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/60">
          {[
            { key: "all", label: "All Beds" },
            { key: "occupied", label: "Active Drying" },
            { key: "critical", label: "Days 0-3" },
            { key: "empty", label: "Vacant" },
            { key: "maintenance", label: "Maintenance" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all ${
                statusFilter === f.key
                  ? "bg-card text-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search by Lot / Bed */}
        <div className="relative w-44">
          <Input
            placeholder="Search lot or bed..."
            value={searchLot}
            onChange={(e) => setSearchLot(e.target.value)}
            className="h-9 text-xs pl-3"
          />
        </div>

        {/* Density Config Toggle */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            variant={showDensityConfig ? "default" : "outline"}
            size="sm"
            className="h-9 text-xs gap-1.5 font-medium"
            onClick={() => setShowDensityConfig(!showDensityConfig)}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Density: {density}kg/m²</span>
          </Button>
          {showDensityConfig && (
            <div className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded border">
              <Input
                type="number"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value) || 30)}
                className="w-16 h-7 text-xs font-mono"
              />
              <span className="text-[10px] text-muted-foreground font-semibold">KG/m²</span>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex gap-1 border-l pl-2 border-border">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              className="h-9 w-9"
              onClick={() => setViewMode("grid")}
              title="Field Map Grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "batch" ? "default" : "outline"}
              size="icon"
              className="h-9 w-9"
              onClick={() => setViewMode("batch")}
              title="Batch Schedule Timeline"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Moisture & Stage Color Legend */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-border/80 text-xs">
        <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Moisture Progression:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-muted-foreground">Days 0-3 (High Moisture ~45%, hourly raking required)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Days 4-10 (Active Drying ~25%–14%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Days 11-14 (Export Target 10.5%–11.5% reached)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="text-muted-foreground">Vacant / Staged</span>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground font-mono text-xs">Loading station telemetry...</div>
      ) : viewMode === "grid" ? (
        bedsByBlock.length > 0 ? (
          bedsByBlock.map(({ blockName, beds: blockBeds }) => (
            <div key={blockName} className="bg-card rounded-lg p-5 border border-border/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <h3 className="font-sans font-bold text-sm tracking-tight text-foreground">{blockName}</h3>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    ({blockBeds.length} beds • {blockBeds.filter((b) => b.status === "occupied").length} active)
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Area: {blockBeds.reduce((s, b) => s + Number(b.surface_area ?? Number(b.length) * Number(b.width)), 0)} m²
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
                {blockBeds.map((bed) => (
                  <BedCard key={bed.id} bed={bed} onClick={setSelectedBed} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-card rounded-lg p-12 border border-border text-center">
            <p className="text-sm text-muted-foreground">No beds match your filter criteria.</p>
          </div>
        )
      ) : (
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
