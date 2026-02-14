import { useState } from "react";
import { X } from "lucide-react";

type BedStatus = "red" | "yellow" | "green" | "grey" | "black";

interface Bed {
  id: string;
  status: BedStatus;
  lotId?: string;
  weight?: number;
  daysDrying?: number;
  region?: string;
}

const statusLabels: Record<BedStatus, string> = {
  red: "Days 0-3",
  yellow: "Active Drying",
  green: "Finished",
  grey: "Empty",
  black: "Maintenance",
};

const statusColors: Record<BedStatus, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
  grey: "bg-status-grey",
  black: "bg-status-black",
};

const statusText: Record<BedStatus, string> = {
  red: "text-white",
  yellow: "text-status-black",
  green: "text-white",
  grey: "text-white",
  black: "text-white",
};

const generateBeds = (block: string, count: number): Bed[] => {
  const statuses: BedStatus[] = ["red", "yellow", "green", "grey", "black"];
  return Array.from({ length: count }, (_, i) => {
    const s = statuses[Math.floor(Math.random() * 5)];
    return {
      id: `${block}-${String(i + 1).padStart(2, "0")}`,
      status: s,
      lotId: s !== "grey" && s !== "black" ? `LOT-${2800 + Math.floor(Math.random() * 100)}` : undefined,
      weight: s !== "grey" && s !== "black" ? Math.floor(Math.random() * 300) + 50 : undefined,
      daysDrying: s === "red" ? Math.floor(Math.random() * 3) + 1 : s === "yellow" ? Math.floor(Math.random() * 7) + 4 : s === "green" ? Math.floor(Math.random() * 3) + 11 : undefined,
      region: s !== "grey" && s !== "black" ? ["Nyeri", "Kirinyaga", "Embu"][Math.floor(Math.random() * 3)] : undefined,
    };
  });
};

const blocks = [
  { id: "A", beds: generateBeds("A", 25) },
  { id: "B", beds: generateBeds("B", 25) },
  { id: "C", beds: generateBeds("C", 28) },
];

const BedManagement = () => {
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Bed Management</h1>
        <p className="text-muted-foreground mt-1">Visual bed grid organized by block</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.keys(statusLabels) as BedStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${statusColors[s]}`} />
            <span className="text-xs text-muted-foreground">{statusLabels[s]}</span>
          </div>
        ))}
      </div>

      {/* Blocks */}
      {blocks.map((block) => (
        <div key={block.id} className="bg-card rounded-xl p-5 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Block {block.id}</h3>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
            {block.beds.map((bed) => (
              <button
                key={bed.id}
                onClick={() => setSelectedBed(bed)}
                className={`aspect-square rounded-lg ${statusColors[bed.status]} ${statusText[bed.status]} flex flex-col items-center justify-center text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer`}
              >
                <span>{bed.id}</span>
                {bed.weight && <span className="text-[8px] opacity-80">{bed.weight}kg</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Bed Detail Modal */}
      {selectedBed && (
        <div className="fixed inset-0 bg-foreground/30 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBed(null)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md card-shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl">Bed {selectedBed.id}</h3>
              <button onClick={() => setSelectedBed(null)} className="p-1 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`status-badge ${statusColors[selectedBed.status]} ${statusText[selectedBed.status]}`}>
                  {statusLabels[selectedBed.status]}
                </span>
              </div>
              {selectedBed.lotId && (
                <>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Lot ID</span>
                    <span className="text-sm font-medium">{selectedBed.lotId}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Region</span>
                    <span className="text-sm font-medium">{selectedBed.region}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Weight</span>
                    <span className="text-sm font-medium">{selectedBed.weight} KG</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Days Drying</span>
                    <span className="text-sm font-medium">{selectedBed.daysDrying}</span>
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                  Log Turning
                </button>
                <button className="flex-1 py-2.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">
                  Log Cleaning
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BedManagement;
