import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLot } from "@/hooks/useLots";
import { format } from "date-fns";
import { Coffee, Layers, Package, Truck, CheckCircle2, ArrowRight } from "lucide-react";

interface LotDetailModalProps {
  lotId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusBadgeColor: Record<string, string> = {
  received: "bg-blue-500/10 text-blue-700 border-blue-200",
  drying: "bg-amber-500/10 text-amber-700 border-amber-200",
  ready_for_grinding: "bg-purple-500/10 text-purple-700 border-purple-200",
  grinding: "bg-orange-500/10 text-orange-700 border-orange-200",
  ready_for_shipment: "bg-teal-500/10 text-teal-700 border-teal-200",
  shipped: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  merged: "bg-muted text-muted-foreground border-border",
};

export function LotDetailModal({ lotId, open, onClose }: LotDetailModalProps) {
  const { data: lot, isLoading } = useLot(lotId || undefined);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-serif text-2xl flex items-center gap-3">
              <Coffee className="w-6 h-6 text-primary" />
              {lot?.lot_number || "Loading Lot..."}
            </DialogTitle>
            {lot && (
              <Badge variant="outline" className={`capitalize px-2.5 py-1 ${statusBadgeColor[lot.status] || ""}`}>
                {lot.status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {isLoading || !lot ? (
          <div className="py-12 text-center text-muted-foreground">Loading lifecycle details...</div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* General Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Region</p>
                <p className="text-sm font-semibold mt-0.5">{lot.region}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Initial Wet Weight</p>
                <p className="text-sm font-semibold mt-0.5">{Number(lot.initial_weight).toLocaleString()} KG</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Weight</p>
                <p className="text-sm font-semibold mt-0.5">{Number(lot.current_weight).toLocaleString()} KG</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Intake Date</p>
                <p className="text-sm font-semibold mt-0.5">{format(new Date(lot.intake_date), "MMM d, yyyy")}</p>
              </div>
            </div>

            {/* Traceability Lineage: Parent Lots (if merged) */}
            {lot.parent_lots && lot.parent_lots.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-primary" /> Source Batches Merged Into This Lot
                </h4>
                <div className="border rounded-lg p-3 divide-y divide-border/50 bg-card">
                  {lot.parent_lots.map((parent) => (
                    <div key={parent.id} className="py-2 first:pt-0 last:pb-0 flex justify-between items-center text-sm">
                      <div>
                        <span className="font-mono font-medium">{parent.lot_number}</span>
                        <span className="text-xs text-muted-foreground ml-2">({parent.region})</span>
                      </div>
                      <span className="text-xs font-semibold">{Number(parent.initial_weight).toLocaleString()} KG</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Lifecycle Timeline */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-4">Post-Harvest Processing Timeline</h4>
              <ol className="relative border-l border-border ml-3 space-y-6">
                {/* 1. Intake Stage */}
                <li className="ml-6">
                  <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-primary/20 rounded-full ring-4 ring-background">
                    <Coffee className="w-3 h-3 text-primary" />
                  </span>
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-medium text-sm">Cherry Intake Recorded</h5>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Received {Number(lot.initial_weight).toLocaleString()} KG fresh cherry from {lot.region}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground">{format(new Date(lot.intake_date), "MMM d, yyyy")}</time>
                  </div>
                </li>

                {/* 2. Drying Stage */}
                {lot.bed_assignments && lot.bed_assignments.length > 0 && (
                  <li className="ml-6">
                    <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-amber-500/20 rounded-full ring-4 ring-background">
                      <Layers className="w-3 h-3 text-amber-600" />
                    </span>
                    <div>
                      <h5 className="font-medium text-sm">Drying Operations</h5>
                      {lot.bed_assignments.map((assignment) => (
                        <div key={assignment.id} className="mt-1 text-xs text-muted-foreground">
                          <span>Assigned: {Number(assignment.assigned_weight).toLocaleString()} KG</span>
                          {assignment.final_weight && (
                            <span className="ml-2 font-medium text-foreground">
                              → Final Dry Parchment: {Number(assignment.final_weight).toLocaleString()} KG
                            </span>
                          )}
                          <span className="block text-[11px] text-muted-foreground/70">
                            {format(new Date(assignment.assigned_date), "MMM d, yyyy")}
                            {assignment.completed_at && ` — Completed ${format(new Date(assignment.completed_at), "MMM d, yyyy")}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </li>
                )}

                {/* 3. Grinding Stage */}
                {lot.grinding_batches && lot.grinding_batches.length > 0 && (
                  <li className="ml-6">
                    <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-purple-500/20 rounded-full ring-4 ring-background">
                      <Package className="w-3 h-3 text-purple-600" />
                    </span>
                    <div>
                      <h5 className="font-medium text-sm">Dry Milling / Grinding</h5>
                      {lot.grinding_batches.map((batch) => (
                        <div key={batch.id} className="mt-1 text-xs text-muted-foreground">
                          <span>Input Parchment: {Number(batch.dry_weight).toLocaleString()} KG</span>
                          {batch.ground_weight && (
                            <span className="ml-2 font-medium text-foreground">
                              → Output Clean Green: {Number(batch.ground_weight).toLocaleString()} KG
                              ({((Number(batch.ground_weight) / Number(batch.dry_weight)) * 100).toFixed(1)}% yield)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </li>
                )}

                {/* 4. Shipment Stage */}
                {lot.shipments && lot.shipments.length > 0 && (
                  <li className="ml-6">
                    <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-emerald-500/20 rounded-full ring-4 ring-background">
                      <Truck className="w-3 h-3 text-emerald-600" />
                    </span>
                    <div>
                      <h5 className="font-medium text-sm">Export Shipment</h5>
                      {lot.shipments.map((s) => (
                        <div key={s.id} className="mt-1 text-xs text-muted-foreground">
                          <span className="font-mono">{s.shipment_number || "SH-Consignment"}: </span>
                          <span>{Number(s.weight).toLocaleString()} KG to {s.destination}</span>
                          <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                            {s.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </li>
                )}
              </ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
