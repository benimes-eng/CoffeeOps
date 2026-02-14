import { FileDown, Filter } from "lucide-react";

const ReportsPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and export operational reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-5 card-shadow border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Report Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Date Range</label>
            <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Site</label>
            <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>All Sites</option>
              <option>Nyeri Estate</option>
              <option>Kirinyaga Farm</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Batch</label>
            <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>All Batches</option>
              <option>LOT-2847</option>
              <option>LOT-2843</option>
            </select>
          </div>
        </div>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: "Drying Report", desc: "Bed utilization and drying lifecycle summary" },
          { title: "Payroll Report", desc: "Worker wages and cost per KG breakdown" },
          { title: "Intake Report", desc: "Cherry intake volumes by region and date" },
          { title: "Inventory Report", desc: "Equipment and consumables status" },
          { title: "Production Report", desc: "End-to-end production metrics" },
          { title: "Worker Performance", desc: "Individual worker activity summary" },
        ].map((report) => (
          <div key={report.title} className="bg-card rounded-xl p-5 card-shadow border border-border/50 flex flex-col justify-between">
            <div className="mb-4">
              <h4 className="font-serif text-lg text-foreground">{report.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{report.desc}</p>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity">
                <FileDown className="w-3 h-3" />
                PDF
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors">
                <FileDown className="w-3 h-3" />
                CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsPage;
