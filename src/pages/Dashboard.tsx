import { MetricCard } from "@/components/dashboard/MetricCard";
import { Layers, Activity, Package, Users, Clock, Truck } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format } from "date-fns";

const DENSITY = 30;

const shipmentStatusSteps = ["preparing", "in_transit", "arrived", "confirmed"];
const shipmentStatusLabels: Record<string, string> = {
  preparing: "Preparing",
  in_transit: "In Transit",
  arrived: "Arrived",
  confirmed: "Completed",
};
const shipmentStatusColors: Record<string, string> = {
  preparing: "bg-muted text-muted-foreground",
  in_transit: "bg-info/10 text-info",
  arrived: "bg-warning/10 text-warning",
  confirmed: "bg-success/10 text-success",
};

function useDashboardData() {
  const beds = useQuery({
    queryKey: ["dashboard-beds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select("id, status, surface_area, block_id, blocks(name, site_id, sites(name))");
      if (error) throw error;
      return data;
    },
  });

  const assignments = useQuery({
    queryKey: ["dashboard-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bed_assignments")
        .select("id, assigned_weight, assigned_date, is_active, bed_id");
      if (error) throw error;
      return data;
    },
  });

  const lots = useQuery({
    queryKey: ["dashboard-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, status, intake_date");
      if (error) throw error;
      return data;
    },
  });

  const workers = useQuery({
    queryKey: ["dashboard-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("id, status");
      if (error) throw error;
      return data;
    },
  });

  const activityLogs = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bed_activity_logs")
        .select("id, action_type, description, created_at, bed_id, beds(bed_number, block_id, blocks(name, site_id, sites(name)))")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const shipments = useQuery({
    queryKey: ["dashboard-shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("id, status, destination, shipment_date, lot_id, lots(lot_number)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  return { beds, assignments, lots, workers, activityLogs, shipments };
}

interface ShipmentDashboardItem {
  id: string;
  status: string;
  destination: string;
  shipment_date: string;
  lot_id: string | null;
  confirmed_at?: string | null;
  lots: { lot_number: string } | null;
}

interface ActivityLogDashboardItem {
  id: string;
  action_type: string;
  description: string | null;
  created_at: string;
  bed_id: string;
  beds: {
    bed_number: string;
    block_id: string | null;
    blocks: {
      name: string;
      site_id: string | null;
      sites: { name: string } | null;
    } | null;
  } | null;
}

interface BedDashboardItem {
  id: string;
  bed_number: string;
  status: string;
  surface_area: number | null;
  block_id: string | null;
  blocks: {
    name: string;
  } | null;
}

const Dashboard = () => {
  const { beds, assignments, lots, workers, activityLogs, shipments } = useDashboardData();

  const allBeds = (beds.data ?? []) as unknown as BedDashboardItem[];
  const activeAssignments = (assignments.data ?? []).filter((a) => a.is_active);
  const allLots = lots.data ?? [];
  const allWorkers = workers.data ?? [];
  const recentActivity = (activityLogs.data ?? []) as unknown as ActivityLogDashboardItem[];
  const recentShipments = (shipments.data ?? []) as unknown as ShipmentDashboardItem[];

  // Metrics
  const totalSurfaceArea = allBeds.reduce((s, b) => s + (Number(b.surface_area) || 0), 0);
  const totalCapacity = totalSurfaceArea * DENSITY;
  const occupiedWeight = activeAssignments.reduce((s, a) => s + Number(a.assigned_weight), 0);
  const utilization = totalCapacity > 0 ? Math.round((occupiedWeight / totalCapacity) * 100) : 0;
  const availableCapacity = totalCapacity - occupiedWeight;
  const activeBatches = allLots.filter((l) => l.status === "drying").length;
  const activeWorkers = allWorkers.filter((w) => w.status === "active").length;

  // Latest shipment for status widget
  const latestShipment = recentShipments[0];

  // Pie chart - bed status distribution
  const now = new Date();
  const statusCounts = { critical: 0, active: 0, finished: 0, empty: 0, maintenance: 0 };
  allBeds.forEach((bed) => {
    if (bed.status === "maintenance") {
      statusCounts.maintenance++;
    } else if (bed.status === "empty") {
      const assignment = activeAssignments.find((a) => a.bed_id === bed.id);
      if (!assignment) statusCounts.empty++;
    } else {
      const assignment = activeAssignments.find((a) => a.bed_id === bed.id);
      if (assignment) {
        const days = differenceInDays(now, new Date(assignment.assigned_date));
        if (days <= 3) statusCounts.critical++;
        else statusCounts.active++;
      } else {
        statusCounts.empty++;
      }
    }
  });

  const finishedBeds = allLots.filter((l) => l.status === "finished").length;
  statusCounts.finished = finishedBeds;

  const pieData = [
    { name: "Drying (0-3 days)", value: statusCounts.critical, color: "hsl(0, 84%, 60%)" },
    { name: "Active Drying", value: statusCounts.active, color: "hsl(38, 92%, 50%)" },
    { name: "Finished", value: statusCounts.finished, color: "hsl(158, 64%, 40%)" },
    { name: "Empty", value: statusCounts.empty, color: "hsl(215, 16%, 75%)" },
    { name: "Maintenance", value: statusCounts.maintenance, color: "hsl(222, 47%, 20%)" },
  ].filter((d) => d.value > 0);

  // Bar chart - by block
  const blockMap = new Map<string, { name: string; occupied: number; empty: number; maintenance: number }>();
  allBeds.forEach((bed) => {
    const blockName = bed.blocks?.name ?? "Unknown";
    if (!blockMap.has(blockName)) blockMap.set(blockName, { name: blockName, occupied: 0, empty: 0, maintenance: 0 });
    const entry = blockMap.get(blockName)!;
    if (bed.status === "maintenance") entry.maintenance++;
    else if (bed.status === "occupied") entry.occupied++;
    else entry.empty++;
  });
  const barData = Array.from(blockMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Activity log formatting with site/block/bed details
  const formatAction = (log: ActivityLogDashboardItem) => {
    const bedNum = log.beds?.bed_number ?? "Unknown";
    const blockName = log.beds?.blocks?.name ?? "";
    const siteName = log.beds?.blocks?.sites?.name ?? "";
    const location = [siteName, blockName].filter(Boolean).join(" – ");

    const actionMap: Record<string, string> = {
      turning: `Coffee turning at ${location} – Bed ${bedNum}`,
      cleaning: `Cleaning/sorting at ${location} – Bed ${bedNum}`,
      inspection: `Inspection at ${location} – Bed ${bedNum}`,
      assignment: `Coffee assigned at ${location} – Bed ${bedNum}`,
      removal: `Coffee removed from ${location} – Bed ${bedNum}`,
      maintenance_start: `Maintenance flagged at ${location} – Bed ${bedNum}`,
      maintenance_end: `Maintenance resolved at ${location} – Bed ${bedNum}`,
      rain_cover: `Rain cover deployed at ${location} – Bed ${bedNum}`,
      finished: `Coffee drying completed at ${location} – Bed ${bedNum}`,
      maintenance_flag: `Maintenance flagged at ${location} – Bed ${bedNum}`,
    };
    return log.description || actionMap[log.action_type] || `${log.action_type} on Bed ${bedNum}`;
  };

  const isLoading = beds.isLoading || assignments.isLoading || lots.isLoading || workers.isLoading;

  return (
    <div className="space-y-6">
      {/* Formal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
            <span>Enterprise Operations</span>
            <span>/</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Executive Cockpit</span>
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-foreground">
            Washing Station Operations Control
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidated drying field capacity, parchment batches, and regional export dispatches
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard title="Drying Capacity" value={isLoading ? "..." : `${(totalCapacity / 1000).toFixed(1)} T`} subtitle={`${totalCapacity.toLocaleString()} KG total`} icon={<Layers className="w-4 h-4" />} />
        <MetricCard title="Field Utilization" value={isLoading ? "..." : `${utilization}%`} subtitle={`${occupiedWeight.toLocaleString()} KG loaded`} trend={utilization > 70 ? "up" : "neutral"} trendValue="Active" icon={<Activity className="w-4 h-4" />} />
        <MetricCard title="Available Buffer" value={isLoading ? "..." : `${(availableCapacity / 1000).toFixed(1)} T`} subtitle="Ready for harvest intake" icon={<Package className="w-4 h-4" />} />
        <MetricCard title="Active Batches" value={isLoading ? "..." : activeBatches} subtitle="On drying tables" icon={<Clock className="w-4 h-4" />} />
        <MetricCard title="Active Labor Force" value={isLoading ? "..." : activeWorkers} subtitle="Field workers on shift" icon={<Users className="w-4 h-4" />} />
      </div>

      {/* Shipment Status Widget */}
      <div className="bg-card rounded-lg p-5 border border-border/80 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-sans font-bold text-sm text-foreground">Export Consignment Milestone Tracker</h3>
        </div>
        {latestShipment ? (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              {latestShipment.lots?.lot_number} → {latestShipment.destination}
            </p>
            <div className="flex items-center gap-2">
              {shipmentStatusSteps.map((step, i) => {
                const stepIndex = shipmentStatusSteps.indexOf(latestShipment.status);
                const isActive = i <= stepIndex;
                return (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div className={`flex-1 h-2 rounded-full ${isActive ? "bg-primary" : "bg-muted"}`} />
                    {i === shipmentStatusSteps.length - 1 ? null : null}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              {shipmentStatusSteps.map((step) => (
                <span key={step} className={`text-[10px] ${step === latestShipment.status ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  {shipmentStatusLabels[step]}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No shipments yet.</p>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Drying Status Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" strokeWidth={2} stroke="hsl(0, 0%, 100%)">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(0, 0%, 100%)", border: "1px solid hsl(35, 15%, 88%)", borderRadius: "8px", fontSize: "13px" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-20">No bed data yet.</p>
          )}
        </div>

        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Bed Utilization by Block</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 15%, 88%)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(0, 0%, 100%)", border: "1px solid hsl(35, 15%, 88%)", borderRadius: "8px", fontSize: "13px" }} />
                <Bar dataKey="occupied" fill="hsl(25, 45%, 22%)" radius={[4, 4, 0, 0]} name="Occupied" />
                <Bar dataKey="empty" fill="hsl(35, 20%, 80%)" radius={[4, 4, 0, 0]} name="Empty" />
                <Bar dataKey="maintenance" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="Maintenance" />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-20">No block data yet.</p>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
        <h3 className="font-serif text-lg mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.length === 0 && recentShipments.length === 0 && (
            <p className="text-muted-foreground text-sm">No recent activity.</p>
          )}
          {/* Shipment arrival events */}
          {recentShipments
            .filter((s) => s.status === "confirmed")
            .map((s) => (
              <div key={`ship-${s.id}`} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground font-mono w-16 pt-0.5">
                  {s.confirmed_at ? format(new Date(s.confirmed_at), "HH:mm") : "—"}
                </span>
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-success" />
                <p className="text-sm text-foreground">
                  Shipment {s.lots?.lot_number} arrived at {s.destination}
                </p>
              </div>
            ))}
          {recentActivity.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground font-mono w-16 pt-0.5">
                {format(new Date(log.created_at), "HH:mm")}
              </span>
              <div
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  ["assignment", "removal"].includes(log.action_type) ? "bg-success"
                    : ["maintenance_start", "maintenance_flag"].includes(log.action_type) ? "bg-destructive"
                    : "bg-accent"
                }`}
              />
              <div>
                <p className="text-sm text-foreground">{formatAction(log)}</p>
                <p className="text-[10px] text-muted-foreground">{format(new Date(log.created_at), "MMM dd, yyyy")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
