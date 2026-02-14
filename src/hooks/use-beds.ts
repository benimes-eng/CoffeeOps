import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// ---- Types ----
export interface BedRow {
  id: string;
  bed_number: string;
  block_id: string;
  length: number;
  width: number;
  surface_area: number | null;
  material_type: string | null;
  status: "empty" | "occupied" | "maintenance";
  blocks: { id: string; name: string; site_id: string; sites: { id: string; name: string } };
}

export interface AssignmentRow {
  id: string;
  bed_id: string;
  lot_id: string;
  assigned_weight: number;
  assigned_date: string;
  expected_completion: string | null;
  is_active: boolean;
  density_used: number;
  assigned_area: number | null;
  completed_at: string | null;
  lots: {
    id: string;
    lot_number: string;
    region: string;
    intake_date: string;
    initial_weight: number;
    current_weight: number;
    status: string;
  };
}

export interface BedWithAssignment extends BedRow {
  activeAssignment?: AssignmentRow;
  dryingDays?: number;
  dryingPhase?: "critical" | "active" | "finished" | "empty" | "maintenance";
}

export interface ActivityLog {
  id: string;
  bed_id: string;
  bed_assignment_id: string | null;
  action_type: string;
  description: string | null;
  performed_by: string | null;
  created_at: string;
}

// ---- Hooks ----

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useBlocks(siteId?: string) {
  return useQuery({
    queryKey: ["blocks", siteId],
    queryFn: async () => {
      let q = supabase.from("blocks").select("*").order("name");
      if (siteId) q = q.eq("site_id", siteId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useLots() {
  return useQuery({
    queryKey: ["lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").order("intake_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useBedsWithAssignments(siteId?: string, blockId?: string) {
  return useQuery({
    queryKey: ["beds-with-assignments", siteId, blockId],
    queryFn: async () => {
      // Fetch beds with block/site info
      let bedsQuery = supabase
        .from("beds")
        .select("*, blocks!inner(id, name, site_id, sites!inner(id, name))")
        .order("bed_number");

      if (siteId) bedsQuery = bedsQuery.eq("blocks.site_id", siteId);
      if (blockId) bedsQuery = bedsQuery.eq("block_id", blockId);

      const { data: beds, error: bedsErr } = await bedsQuery;
      if (bedsErr) throw bedsErr;

      // Fetch active assignments with lot info
      const { data: assignments, error: assignErr } = await supabase
        .from("bed_assignments")
        .select("*, lots(*)")
        .eq("is_active", true);
      if (assignErr) throw assignErr;

      const assignmentMap = new Map<string, AssignmentRow>();
      (assignments as unknown as AssignmentRow[]).forEach((a) => assignmentMap.set(a.bed_id, a));

      const now = new Date();
      const enriched: BedWithAssignment[] = (beds as unknown as BedRow[]).map((bed) => {
        const assignment = assignmentMap.get(bed.id);
        let dryingDays: number | undefined;
        let dryingPhase: BedWithAssignment["dryingPhase"] = "empty";

        if (bed.status === "maintenance") {
          dryingPhase = "maintenance";
        } else if (assignment) {
          const assignedDate = new Date(assignment.assigned_date);
          dryingDays = Math.floor((now.getTime() - assignedDate.getTime()) / (1000 * 60 * 60 * 24));
          if (assignment.lots?.status === "finished" || assignment.completed_at) {
            dryingPhase = "finished";
          } else if (dryingDays <= 3) {
            dryingPhase = "critical";
          } else {
            dryingPhase = "active";
          }
        }

        return { ...bed, activeAssignment: assignment, dryingDays, dryingPhase };
      });

      return enriched;
    },
  });
}

export function useBedActivityLogs(bedId?: string) {
  return useQuery({
    queryKey: ["bed-activity-logs", bedId],
    enabled: !!bedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bed_activity_logs")
        .select("*")
        .eq("bed_id", bedId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityLog[];
    },
  });
}

// ---- Mutations ----

export function useLogBedAction() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      bedId: string;
      assignmentId?: string;
      actionType: string;
      description?: string;
    }) => {
      const { error } = await supabase.from("bed_activity_logs").insert({
        bed_id: params.bedId,
        bed_assignment_id: params.assignmentId || null,
        action_type: params.actionType as any,
        description: params.description || null,
        performed_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bed-activity-logs"] });
      qc.invalidateQueries({ queryKey: ["beds-with-assignments"] });
    },
  });
}

export function useUpdateBedStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { bedId: string; status: "empty" | "occupied" | "maintenance" }) => {
      const { error } = await supabase.from("beds").update({ status: params.status }).eq("id", params.bedId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beds-with-assignments"] });
    },
  });
}

export function useAssignLotToBed() {
  const qc = useQueryClient();
  const logAction = useLogBedAction();

  return useMutation({
    mutationFn: async (params: {
      bedId: string;
      lotId: string;
      weight: number;
      density: number;
      area: number;
      expectedCompletion?: string;
    }) => {
      // Create assignment
      const { error: assignErr } = await supabase.from("bed_assignments").insert({
        bed_id: params.bedId,
        lot_id: params.lotId,
        assigned_weight: params.weight,
        density_used: params.density,
        assigned_area: params.area,
        expected_completion: params.expectedCompletion || null,
        is_active: true,
      });
      if (assignErr) throw assignErr;

      // Update bed status
      const { error: bedErr } = await supabase.from("beds").update({ status: "occupied" as any }).eq("id", params.bedId);
      if (bedErr) throw bedErr;
    },
    onSuccess: (_, params) => {
      logAction.mutate({
        bedId: params.bedId,
        actionType: "assignment",
        description: `Assigned ${params.weight} KG at ${params.density} KG/m² density`,
      });
      qc.invalidateQueries({ queryKey: ["beds-with-assignments"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
    },
  });
}

export function useMarkBedFinished() {
  const qc = useQueryClient();
  const logAction = useLogBedAction();

  return useMutation({
    mutationFn: async (params: { bedId: string; assignmentId: string }) => {
      // Mark assignment completed
      await supabase
        .from("bed_assignments")
        .update({ is_active: false, completed_at: new Date().toISOString() })
        .eq("id", params.assignmentId);

      // Set bed to empty
      await supabase.from("beds").update({ status: "empty" as any }).eq("id", params.bedId);
    },
    onSuccess: (_, params) => {
      logAction.mutate({
        bedId: params.bedId,
        assignmentId: params.assignmentId,
        actionType: "finished",
        description: "Drying completed, bed cleared",
      });
      qc.invalidateQueries({ queryKey: ["beds-with-assignments"] });
    },
  });
}

export function useToggleMaintenance() {
  const qc = useQueryClient();
  const logAction = useLogBedAction();

  return useMutation({
    mutationFn: async (params: { bedId: string; toMaintenance: boolean; description?: string }) => {
      const newStatus = params.toMaintenance ? "maintenance" : "empty";
      await supabase.from("beds").update({ status: newStatus as any }).eq("id", params.bedId);

      if (params.toMaintenance) {
        // Deactivate any active assignment
        await supabase
          .from("bed_assignments")
          .update({ is_active: false, completed_at: new Date().toISOString() })
          .eq("bed_id", params.bedId)
          .eq("is_active", true);
      }
    },
    onSuccess: (_, params) => {
      logAction.mutate({
        bedId: params.bedId,
        actionType: params.toMaintenance ? "maintenance_start" : "maintenance_end",
        description: params.description || (params.toMaintenance ? "Flagged for maintenance" : "Maintenance completed"),
      });
      qc.invalidateQueries({ queryKey: ["beds-with-assignments"] });
    },
  });
}

// ---- Utility ----
export function getDryingColor(phase?: BedWithAssignment["dryingPhase"]) {
  switch (phase) {
    case "critical": return { bg: "bg-status-red", text: "text-white", label: "Day 0-3" };
    case "active": return { bg: "bg-status-yellow", text: "text-status-black", label: "Active Drying" };
    case "finished": return { bg: "bg-status-green", text: "text-white", label: "Finished" };
    case "maintenance": return { bg: "bg-status-black", text: "text-white", label: "Maintenance" };
    default: return { bg: "bg-status-grey", text: "text-white", label: "Empty" };
  }
}
