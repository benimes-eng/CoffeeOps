import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startGrinding, completeGrinding } from "@/services/grindingService";
import { useToast } from "@/hooks/use-toast";
import { LOTS_QUERY_KEY } from "./useLots";

export const GRINDING_BATCHES_KEY = ["grinding-batches"] as const;

export interface GrindingBatchWithLot {
  id: string;
  batch_number: string;
  lot_id: string;
  dry_weight: number;
  ground_weight?: number | null;
  status: string;
  started_at: string;
  completed_at?: string | null;
  milling_loss?: number | null;
  yield_percent?: number | null;
  lot?: {
    lot_number: string;
    region: string;
    current_weight: number;
  } | null;
}

export function useGrindingBatches() {
  return useQuery({
    queryKey: GRINDING_BATCHES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grinding_batches")
        .select("*, lot:lots!grinding_batches_lot_id_fkey(lot_number, region, current_weight)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GrindingBatchWithLot[];
    },
  });
}

export function useStartGrinding() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (lotId: string) => startGrinding(lotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GRINDING_BATCHES_KEY });
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      toast({ title: "Grinding Started", description: "Batch is now in progress." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start grinding", description: err.message, variant: "destructive" });
    },
  });
}

export function useCompleteGrinding() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      batchId,
      lotId,
      groundWeight,
      dryWeight,
    }: {
      batchId: string;
      lotId: string;
      groundWeight: number;
      dryWeight: number;
    }) => completeGrinding(batchId, lotId, groundWeight, dryWeight),
    onSuccess: (result: { yield_percent?: number; yieldPercent?: number } | null) => {
      qc.invalidateQueries({ queryKey: GRINDING_BATCHES_KEY });
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      toast({
        title: "Grinding Completed",
        description: `Milling yield: ${result?.yield_percent ?? result?.yieldPercent ?? ""}% • Ready for shipment.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete grinding", description: err.message, variant: "destructive" });
    },
  });
}
