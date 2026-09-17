import { BedWithDetails, getBedStatusColor, getDryingDays, getDryingPhase } from "@/services/bedService";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Droplets, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

const statusBorderMap: Record<string, string> = {
  red: "border-red-500/50 hover:border-red-600 bg-red-500/5",
  yellow: "border-amber-500/50 hover:border-amber-600 bg-amber-500/5",
  green: "border-emerald-500/50 hover:border-emerald-600 bg-emerald-500/5",
  grey: "border-border hover:border-slate-400 bg-card",
  black: "border-slate-800 bg-slate-900/10 text-slate-500",
};

const badgeMap: Record<string, { label: string; class: string }> = {
  red: { label: "0-3d (Critical)", class: "bg-red-500/15 text-red-700 dark:text-red-400" },
  yellow: { label: "Active Dry", class: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  green: { label: "Ready / Finished", class: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  grey: { label: "Vacant", class: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  black: { label: "Maintenance", class: "bg-slate-900 text-slate-200" },
};

interface BedCardProps {
  bed: BedWithDetails;
  onClick: (bed: BedWithDetails) => void;
}

export function BedCard({ bed, onClick }: BedCardProps) {
  const color = getBedStatusColor(bed);
  const days = bed.active_assignment ? getDryingDays(bed.active_assignment.assigned_date) : null;
  const weight = bed.active_assignment?.assigned_weight;
  const lot = bed.active_assignment?.lot;
  const area = Number(bed.surface_area ?? Number(bed.length) * Number(bed.width));

  // Estimate moisture % drop along a standard 14-day curve if not logged
  // (Starts ~45% down to ~11.5% at day 12-14)
  const estimatedMoisture = days !== null
    ? Math.max(10.5, Math.round((48 - (days * 2.7)) * 10) / 10)
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onClick(bed)}
          className={`relative p-2.5 rounded-lg border text-left flex flex-col justify-between h-28 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${statusBorderMap[color]}`}
        >
          {/* Header: Bed Number + Status Pill */}
          <div className="flex items-center justify-between w-full gap-1">
            <span className="font-mono font-bold text-xs tracking-tight text-foreground">
              {bed.bed_number}
            </span>
            <span className={`w-2 h-2 rounded-full ${
              color === "red" ? "bg-red-500 animate-pulse" :
              color === "yellow" ? "bg-amber-500" :
              color === "green" ? "bg-emerald-500" :
              color === "black" ? "bg-slate-900" : "bg-slate-300"
            }`} />
          </div>

          {/* Middle: Lot Info or Vacancy */}
          <div className="my-auto">
            {bed.status === "occupied" && lot ? (
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold text-foreground truncate max-w-[110px]">
                  {lot.lot_number}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <span>{Number(weight).toFixed(0)}kg</span>
                  <span>•</span>
                  <span>Day {days}</span>
                </div>
              </div>
            ) : bed.status === "maintenance" ? (
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <AlertTriangle className="w-3 h-3" />
                <span>Offline</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground/70 font-medium">
                Vacant ({area}m²)
              </div>
            )}
          </div>

          {/* Footer: Moisture Indicator / Progress */}
          <div className="w-full pt-1 border-t border-border/50 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
            {estimatedMoisture !== null ? (
              <>
                <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium">
                  <Droplets className="w-2.5 h-2.5" />
                  {estimatedMoisture}%
                </span>
                <span className={days! >= 11 ? "text-emerald-600 font-bold" : ""}>
                  D{days}/14
                </span>
              </>
            ) : (
              <span className="text-[9px] text-muted-foreground/60">{bed.material_type || "Wire Mesh"}</span>
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs p-3 space-y-1">
        <p className="font-bold text-sm">Bed {bed.bed_number} — {badgeMap[color]?.label}</p>
        <p className="text-muted-foreground">{area} m² surface area • Material: {bed.material_type || "Wire Mesh"}</p>
        {lot && (
          <div className="pt-1 border-t border-border mt-1">
            <p className="font-semibold text-foreground">Lot: {lot.lot_number} ({lot.region})</p>
            <p className="text-muted-foreground">Assigned: {Number(weight)} KG ({Math.round(Number(weight)/area)} KG/m²)</p>
            <p className="text-muted-foreground">Drying Time: {days} days • Approx. Moisture: {estimatedMoisture}%</p>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
