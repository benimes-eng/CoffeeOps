import { useState } from "react";
import { Wrench, Package, Droplets } from "lucide-react";

const tabs = [
  { id: "machinery", label: "Machinery", icon: Wrench },
  { id: "equipment", label: "Equipment", icon: Package },
  { id: "consumables", label: "Consumables", icon: Droplets },
] as const;

const machineryData = [
  { name: "Pulping Machine #1", status: "Operational", location: "Nyeri Estate", lastService: "2026-01-10" },
  { name: "Drying Fan Unit A", status: "Maintenance", location: "Nyeri Estate", lastService: "2025-12-20" },
  { name: "Transport Truck", status: "Operational", location: "In Transit", lastService: "2026-02-01" },
];

const equipmentData = [
  { name: "Moisture Meter", status: "Available", location: "Warehouse", qty: 5 },
  { name: "Digital Scale (50kg)", status: "In Use", location: "Block A", qty: 3 },
  { name: "Raking Tools", status: "Available", location: "Storage", qty: 20 },
];

const consumablesData = [
  { name: "Drying Tarps", status: "In Stock", qty: 45, reorderAt: 20 },
  { name: "Jute Bags", status: "Low Stock", qty: 12, reorderAt: 30 },
  { name: "Cleaning Solution", status: "In Stock", qty: 8, reorderAt: 5 },
];

const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState<string>("machinery");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Inventory & Machinery</h1>
        <p className="text-muted-foreground mt-1">Track equipment and consumables</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id ? "bg-card text-foreground card-shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "machinery" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Service</th>
                </tr>
              </thead>
              <tbody>
                {machineryData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium">{item.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${item.status === "Operational" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm">{item.location}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.lastService}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === "equipment" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
                </tr>
              </thead>
              <tbody>
                {equipmentData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium">{item.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${item.status === "Available" ? "bg-success/10 text-success" : "bg-info/10 text-info"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm">{item.location}</td>
                    <td className="px-5 py-3.5 text-sm">{item.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === "consumables" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qty</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reorder At</th>
                </tr>
              </thead>
              <tbody>
                {consumablesData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium">{item.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${item.status === "In Stock" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm">{item.qty}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.reorderAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;
