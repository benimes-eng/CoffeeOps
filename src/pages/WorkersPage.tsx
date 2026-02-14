const workers = [
  { id: 1, name: "James Mwangi", role: "Bed Operator", wageType: "Daily", status: "Active" },
  { id: 2, name: "Grace Wanjiku", role: "Sorter", wageType: "Hourly", status: "Active" },
  { id: 3, name: "Peter Kamau", role: "Driver", wageType: "Monthly", status: "Active" },
  { id: 4, name: "Mary Njeri", role: "Bed Operator", wageType: "Daily", status: "On Leave" },
  { id: 5, name: "John Ochieng", role: "Supervisor", wageType: "Monthly", status: "Active" },
  { id: 6, name: "Ann Wairimu", role: "Cleaner", wageType: "Daily", status: "Active" },
];

import { Plus, Users } from "lucide-react";

const WorkersPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Workers</h1>
          <p className="text-muted-foreground mt-1">Manage farm workers</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Add Worker
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Total Workers</p>
          <p className="text-3xl font-serif mt-1">{workers.length}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Active Today</p>
          <p className="text-3xl font-serif mt-1">{workers.filter((w) => w.status === "Active").length}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">On Leave</p>
          <p className="text-3xl font-serif mt-1">{workers.filter((w) => w.status === "On Leave").length}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wage Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 text-sm font-medium flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    {w.name}
                  </td>
                  <td className="px-5 py-3.5 text-sm">{w.role}</td>
                  <td className="px-5 py-3.5 text-sm">{w.wageType}</td>
                  <td className="px-5 py-3.5">
                    <span className={`status-badge ${w.status === "Active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkersPage;
