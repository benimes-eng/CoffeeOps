import { MetricCard } from "@/components/dashboard/MetricCard";
import { Layers, Activity, Package, Users, Clock } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format } from "date-fns";

const DENSITY = 30;

function useDashboardData() {
  const beds = useQuery({
    queryKey: ["dashboard-beds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select("id, status, surface_area, block_id, blocks(name)");
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
        .select("id, action_type, description, created_at, bed_id, beds(bed_number)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  return { beds, assignments, lots, workers, activityLogs };
}

const Dashboard = () => {
  const { beds, assignments, lots, workers, activityLogs } = useDashboardData();

  const allBeds = beds.data ?? [];
  const activeAssignments = (assignments.data ?? []).filter((a) => a.is_active);
  const allLots = lots.data ?? [];
  const allWorkers = workers.data ?? [];
  const recentActivity = activityLogs.data ?? [];

  // Metrics
  const totalSurfaceArea = allBeds.reduce((s, b) => s + (Number(b.surface_area) || 0), 0);
  const totalCapacity = totalSurfaceArea * DENSITY;
  const occupiedWeight = activeAssignments.reduce((s, a) => s + Number(a.assigned_weight), 0);
  const utilization = totalCapacity > 0 ? Math.round((occupiedWeight / totalCapacity) * 100) : 0;
  const availableCapacity = totalCapacity - occupiedWeight;
  const activeBatches = allLots.filter((l) => l.status === "drying").length;
  const activeWorkers = allWorkers.filter((w) => w.status === "active").length;

  // Pie chart - bed status distribution
  const now = new Date();
  const statusCounts = { critical: 0, active: 0, finished: 0, empty: 0, maintenance: 0 };
  allBeds.forEach((bed) => {
    if (bed.status === "maintenance") {
      statusCounts.maintenance++;
    } else if (bed.status === "empty") {
      const assignment = activeAssignments.find((a) => a.bed_id === bed.id);
      if (!assignment) {
        statusCounts.empty++;
      }
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

  // Check for finished lots
  const finishedBeds = allLots.filter((l) => l.status === "finished").length;
  statusCounts.finished = finishedBeds;

  const pieData = [
    { name: "Drying (0-3 days)", value: statusCounts.critical, color: "hsl(0, 72%, 51%)" },
    { name: "Active Drying", value: statusCounts.active, color: "hsl(40, 90%, 50%)" },
    { name: "Finished", value: statusCounts.finished, color: "hsl(140, 45%, 42%)" },
    { name: "Empty", value: statusCounts.empty, color: "hsl(25, 10%, 70%)" },
    { name: "Maintenance", value: statusCounts.maintenance, color: "hsl(25, 25%, 12%)" },
  ].filter((d) => d.value > 0);

  // Bar chart - by block
  const blockMap = new Map<string, { name: string; occupied: number; empty: number; maintenance: number }>();
  allBeds.forEach((bed) => {
    const blockName = (bed as any).blocks?.name ?? "Unknown";
    if (!blockMap.has(blockName)) {
      blockMap.set(blockName, { name: blockName, occupied: 0, empty: 0, maintenance: 0 });
    }
    const entry = blockMap.get(blockName)!;
    if (bed.status === "maintenance") entry.maintenance++;
    else if (bed.status === "occupied") entry.occupied++;
    else entry.empty++;
  });
  const barData = Array.from(blockMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Activity log formatting
  const formatAction = (log: any) => {
    const bedNum = log.beds?.bed_number ?? "Unknown";
    const actionMap: Record<string, string> = {
      turning: `Bed ${bedNum} turned`,
      cleaning: `Bed ${bedNum} cleaned/sorted`,
      inspection: `Bed ${bedNum} inspected`,
      assignment: `Coffee assigned to Bed ${bedNum}`,
      removal: `Coffee removed from Bed ${bedNum}`,
      maintenance_start: `Bed ${bedNum} flagged for maintenance`,
      maintenance_end: `Bed ${bedNum} returned from maintenance`,
      rain_cover: `Rain cover deployed on Bed ${bedNum}`,
      finished: `Bed ${bedNum} marked as finished`,
      maintenance_flag: `Bed ${bedNum} flagged for maintenance`,
    };
    return log.description || actionMap[log.action_type] || `${log.action_type} on Bed ${bedNum}`;
  };

  const isLoading = beds.isLoading || assignments.isLoading || lots.isLoading || workers.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Farm operations overview</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Drying Capacity"
          value={isLoading ? "..." : totalCapacity.toLocaleString()}
          subtitle="KG total"
          icon={<Layers className="w-4 h-4" />}
        />
        <MetricCard
          title="Utilization"
          value={isLoading ? "..." : `${utilization}%`}
          subtitle="current"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          title="Available Space"
          value={isLoading ? "..." : availableCapacity.toLocaleString()}
          subtitle="KG remaining"
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          title="Active Batches"
          value={isLoading ? "..." : activeBatches}
          subtitle="drying"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="Workers Active"
          value={isLoading ? "..." : activeWorkers}
          subtitle="total active"
          icon={<Users className="w-4 h-4" />}
        />
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(35, 15%, 88%)",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(35, 15%, 88%)",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
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
          {recentActivity.length === 0 && (
            <p className="text-muted-foreground text-sm">No recent activity.</p>
          )}
          {recentActivity.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground font-mono w-16 pt-0.5">
                {format(new Date(log.created_at), "HH:mm")}
              </span>
              <div
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  ["assignment", "removal"].includes(log.action_type)
                    ? "bg-success"
                    : ["maintenance_start", "maintenance_flag"].includes(log.action_type)
                    ? "bg-destructive"
                    : "bg-accent"
                }`}
              />
              <p className="text-sm text-foreground">{formatAction(log)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
