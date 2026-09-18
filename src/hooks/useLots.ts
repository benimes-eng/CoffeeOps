import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLots, fetchLotById, createLotIntake, Lot } from "@/services/lotService";
import { mergeLots } from "@/services/warehouseService";
import { LotIntakeInput } from "@/validation/schemas";
import { useToast } from "@/hooks/use-toast";

export const LOTS_QUERY_KEY = ["lots"] as const;

export function useLots(status?: string) {
  return useQuery({
    queryKey: [...LOTS_QUERY_KEY, status ?? "all"],
    queryFn: () => fetchLots(status),
  });
}

export function useLot(lotId?: string) {
  return useQuery({
    queryKey: ["lot", lotId],
    queryFn: () => (lotId ? fetchLotById(lotId) : null),
    enabled: !!lotId,
  });
}

export function useCreateLot() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: LotIntakeInput) => createLotIntake(input),
    onSuccess: (data: Lot) => {
      // Show the server-returned lot immediately, then reconcile every active
      // lot query. This avoids a successful intake disappearing while a
      // refetch is in flight or a browser cache is stale.
      qc.setQueryData<Lot[]>([...LOTS_QUERY_KEY, "all"], (current = []) => [
        data,
        ...current.filter((lot) => lot.id !== data.id),
      ]);
      void qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY, refetchType: "active" });
      toast({
        title: "Cherry Intake Registered",
        description: `Lot ${data.lot_number} created successfully. Next: Assign to drying bed.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Intake Failed",
        description: err.message || "Failed to register lot intake",
        variant: "destructive",
      });
    },
  });
}

export function useMergeLots() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ sourceLotIds, notes }: { sourceLotIds: string[]; notes?: string }) =>
      mergeLots({ sourceLotIds, notes }),
    onSuccess: (data: unknown) => {
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      const lot = data as Lot | undefined;
      toast({
        title: "Lots Merged Successfully",
        description: `New lot ${lot?.lot_number ?? ""} created with full origin traceability.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Merge Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}
