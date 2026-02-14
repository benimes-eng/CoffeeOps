import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBedsWithDetails,
  fetchSites,
  fetchBlocks,
  fetchLots,
  fetchBedActivityLogs,
  logBedAction,
  assignLotToBed,
  markBedFinished,
  flagMaintenance,
  removeMaintenance,
} from "@/services/bedService";
import { useToast } from "@/hooks/use-toast";

export function useSites() {
  return useQuery({ queryKey: ["sites"], queryFn: fetchSites });
}

export function useBlocks(siteId?: string) {
  return useQuery({
    queryKey: ["blocks", siteId],
    queryFn: () => fetchBlocks(siteId),
  });
}

export function useBeds(siteId?: string, blockId?: string) {
  return useQuery({
    queryKey: ["beds", siteId, blockId],
    queryFn: () => fetchBedsWithDetails(siteId, blockId),
  });
}

export function useLots(status?: string) {
  return useQuery({
    queryKey: ["lots", status],
    queryFn: () => fetchLots(status),
  });
}

export function useBedActivityLogs(bedId?: string) {
  return useQuery({
    queryKey: ["bed-activity-logs", bedId],
    queryFn: () => fetchBedActivityLogs(bedId!),
    enabled: !!bedId,
  });
}

export function useBedActions() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beds"] });
    qc.invalidateQueries({ queryKey: ["bed-activity-logs"] });
  };

  const logAction = useMutation({
    mutationFn: ({ bedId, actionType, description, assignmentId }: {
      bedId: string; actionType: string; description?: string; assignmentId?: string;
    }) => logBedAction(bedId, actionType, description, assignmentId),
    onSuccess: () => {
      invalidate();
      toast({ title: "Action logged" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assign = useMutation({
    mutationFn: ({ bedId, lotId, weight, density, area }: {
      bedId: string; lotId: string; weight: number; density: number; area: number;
    }) => assignLotToBed(bedId, lotId, weight, density, area),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast({ title: "Bed assigned successfully" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const finish = useMutation({
    mutationFn: ({ bedId, assignmentId }: { bedId: string; assignmentId: string }) =>
      markBedFinished(bedId, assignmentId),
    onSuccess: () => {
      invalidate();
      toast({ title: "Bed marked as finished" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const maintenance = useMutation({
    mutationFn: ({ bedId, description }: { bedId: string; description: string }) =>
      flagMaintenance(bedId, description),
    onSuccess: () => {
      invalidate();
      toast({ title: "Bed flagged for maintenance" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMaint = useMutation({
    mutationFn: ({ bedId }: { bedId: string }) => removeMaintenance(bedId),
    onSuccess: () => {
      invalidate();
      toast({ title: "Maintenance removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { logAction, assign, finish, maintenance, removeMaint };
}
