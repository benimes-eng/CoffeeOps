import { useState } from "react";
import { MapPin, Plus } from "lucide-react";

const sitesData = [
  {
    id: 1,
    name: "Nyeri Estate",
    region: "Nyeri",
    blocks: [
      { id: "A", beds: 25, occupied: 18, maintenance: 2 },
      { id: "B", beds: 25, occupied: 14, maintenance: 1 },
      { id: "C", beds: 28, occupied: 22, maintenance: 3 },
    ],
  },
  {
    id: 2,
    name: "Kirinyaga Farm",
    region: "Kirinyaga",
    blocks: [
      { id: "D", beds: 20, occupied: 8, maintenance: 0 },
      { id: "E", beds: 15, occupied: 12, maintenance: 1 },
    ],
  },
];

const SitesPage = () => {
  const [selectedSite, setSelectedSite] = useState(sitesData[0]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Sites & Fields</h1>
          <p className="text-muted-foreground mt-1">Manage farm sites and blocks</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          New Site
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Site List */}
        <div className="space-y-3">
          {sitesData.map((site) => (
            <button
              key={site.id}
              onClick={() => setSelectedSite(site)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                selectedSite.id === site.id
                  ? "bg-card border-primary/30 card-shadow"
                  : "bg-card/50 border-border/50 hover:bg-card hover:card-shadow"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{site.name}</p>
                  <p className="text-sm text-muted-foreground">{site.region} · {site.blocks.length} blocks</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Block Grid */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-serif text-xl">{selectedSite.name} — Blocks</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {selectedSite.blocks.map((block) => (
              <div key={block.id} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-serif text-lg">Block {block.id}</h4>
                  <span className="text-xs font-mono text-muted-foreground">{block.beds} beds</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Occupied</span>
                    <span className="font-medium text-foreground">{block.occupied}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(block.occupied / block.beds) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Empty</span>
                    <span className="font-medium">{block.beds - block.occupied - block.maintenance}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Maintenance</span>
                    <span className="font-medium text-destructive">{block.maintenance}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SitesPage;
