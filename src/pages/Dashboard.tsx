import { MetricCard } from "@/components/dashboard/MetricCard";
import { Layers, Activity, Package, Users, Clock } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const pieData = [
  { name: "Drying (0-3 days)", value: 12, color: "hsl(0, 72%, 51%)" },
  { name: "Active Drying", value: 28, color: "hsl(40, 90%, 50%)" },
  { name: "Finished", value: 15, color: "hsl(140, 45%, 42%)" },
  { name: "Empty", value: 20, color: "hsl(25, 10%, 70%)" },
  { name: "Maintenance", value: 5, color: "hsl(25, 25%, 12%)" },
];

const barData = [
  { block: "Block A", occupied: 18, empty: 7, maintenance: 2 },
  { block: "Block B", occupied: 14, empty: 10, maintenance: 1 },
  { block: "Block C", occupied: 22, empty: 3, maintenance: 3 },
  { block: "Block D", occupied: 8, empty: 15, maintenance: 0 },
];

const activityLog = [
  { time: "14:32", action: "Lot #2847 moved to drying beds", type: "intake" },
  { time: "13:15", action: "Payroll approved for Week 6", type: "payroll" },
  { time: "11:48", action: "Bed A-12 marked for maintenance", type: "maintenance" },
  { time: "10:20", action: "New cherry intake: 450 KG from Kirinyaga", type: "intake" },
  { time: "09:05", action: "15 workers clocked in", type: "workers" },
];

const Dashboard = () => {
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
          value="12,500"
          subtitle="KG total"
          icon={<Layers className="w-4 h-4" />}
        />
        <MetricCard
          title="Utilization"
          value="68%"
          trend="up"
          trendValue="+5%"
          subtitle="vs last week"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          title="Available Space"
          value="4,000"
          subtitle="KG remaining"
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          title="Active Batches"
          value="40"
          trend="up"
          trendValue="+3"
          subtitle="this week"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          title="Workers Active"
          value="32"
          trend="neutral"
          trendValue="same"
          subtitle="today"
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Drying Status Distribution</h3>
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
        </div>

        {/* Bar Chart */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Bed Utilization by Block</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 15%, 88%)" />
              <XAxis dataKey="block" tick={{ fontSize: 12 }} />
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
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
        <h3 className="font-serif text-lg mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {activityLog.map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground font-mono w-12 pt-0.5">{item.time}</span>
              <div
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  item.type === "intake"
                    ? "bg-success"
                    : item.type === "maintenance"
                    ? "bg-destructive"
                    : item.type === "payroll"
                    ? "bg-accent"
                    : "bg-info"
                }`}
              />
              <p className="text-sm text-foreground">{item.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
