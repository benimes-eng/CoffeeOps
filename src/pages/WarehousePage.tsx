import { Plus } from "lucide-react";

const stockData = [
  { lotId: "LOT-2847", region: "Nyeri", weight: 450, moisture: "12.5%", status: "Drying" },
  { lotId: "LOT-2843", region: "Kirinyaga", weight: 320, moisture: "14.2%", status: "In Stock" },
  { lotId: "LOT-2840", region: "Embu", weight: 280, moisture: "11.8%", status: "Ready" },
  { lotId: "LOT-2835", region: "Nyeri", weight: 510, moisture: "13.0%", status: "Drying" },
  { lotId: "LOT-2830", region: "Kirinyaga", weight: 190, moisture: "10.5%", status: "Shipped" },
];

const WarehousePage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Warehouse</h1>
          <p className="text-muted-foreground mt-1">Intake and stock management</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          New Intake
        </button>
      </div>

      {/* Intake Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Total Stock</p>
          <p className="text-3xl font-serif mt-1">1,750 KG</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Lots In Process</p>
          <p className="text-3xl font-serif mt-1">8</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Ready to Ship</p>
          <p className="text-3xl font-serif mt-1">3</p>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Region</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Weight (KG)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Moisture</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((row) => (
                <tr key={row.lotId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-mono font-medium">{row.lotId}</td>
                  <td className="px-5 py-3.5 text-sm">{row.region}</td>
                  <td className="px-5 py-3.5 text-sm">{row.weight}</td>
                  <td className="px-5 py-3.5 text-sm">{row.moisture}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`status-badge ${
                        row.status === "Ready"
                          ? "bg-success/10 text-success"
                          : row.status === "Drying"
                          ? "bg-warning/10 text-warning"
                          : row.status === "Shipped"
                          ? "bg-info/10 text-info"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.status}
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

export default WarehousePage;
