import { BedWithDetails, getBedStatusColor, getDryingDays } from "@/services/bedService";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const bgMap: Record<string, string> = {
  red: "bg-status-red",
  yellow: "bg-status-yellow",
  green: "bg-status-green",
  grey: "bg-status-grey",
  black: "bg-status-black",
};

const textMap: Record<string, string> = {
  red: "text-white",
  yellow: "text-foreground",
  green: "text-white",
  grey: "text-white",
  black: "text-white",
};

interface BedCardProps {
  bed: BedWithDetails;
  onClick: (bed: BedWithDetails) => void;
}

export function BedCard({ bed, onClick }: BedCardProps) {
  const color = getBedStatusColor(bed);
  const days = bed.active_assignment ? getDryingDays(bed.active_assignment.assigned_date) : null;
  const weight = bed.active_assignment?.assigned_weight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onClick(bed)}
          className={`aspect-square rounded-lg ${bgMap[color]} ${textMap[color]} flex flex-col items-center justify-center text-[10px] font-medium hover:opacity-80 transition-all cursor-pointer hover:scale-105`}
        >
          <span className="font-semibold">{bed.bed_number}</span>
          {weight && <span className="text-[8px] opacity-80">{Number(weight)}kg</span>}
          {days !== null && <span className="text-[8px] opacity-70">D{days}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-semibold">{bed.bed_number}</p>
        <p>{bed.surface_area ?? (Number(bed.length) * Number(bed.width))} m² • {bed.status}</p>
        {bed.active_assignment?.lot && (
          <p>Lot: {bed.active_assignment.lot.lot_number} • {Number(weight)} KG</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
