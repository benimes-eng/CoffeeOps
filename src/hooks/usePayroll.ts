import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  fetchWorkLogs,
  recordWorkLog,
  generatePayrollFromLogs,
  togglePayrollApproval,
} from "@/services/payrollService";
import { WorkLogInput, PayrollGenerateInput } from "@/validation/schemas";
import { useToast } from "@/hooks/use-toast";

export const PAYROLL_KEY = ["payroll"] as const;
export const WORK_LOGS_KEY = ["work-logs"] as const;

export type PayrollEntry = Tables<"payroll"> & {
  worker: {
    name: string;
    role: string;
    wage_type: string;
    wage_rate: number;
  } | null;
};

export function usePayroll() {
  return useQuery<PayrollEntry[]>({
    queryKey: PAYROLL_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("*, worker:workers!payroll_worker_id_fkey(name, role, wage_type, wage_rate)")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data as unknown as PayrollEntry[]) || [];
    },
  });
}

export function useWorkLogs(workerId?: string) {
  return useQuery({
    queryKey: [...WORK_LOGS_KEY, workerId ?? "all"],
    queryFn: () => fetchWorkLogs(workerId),
  });
}

export function useRecordWorkLog() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: WorkLogInput) => recordWorkLog(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORK_LOGS_KEY });
      toast({ title: "Work Activity Logged", description: "Hours added to worker record." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to log work", description: err.message, variant: "destructive" });
    },
  });
}

export function useGeneratePayroll() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: PayrollGenerateInput) => generatePayrollFromLogs(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYROLL_KEY });
      toast({
        title: "Payroll Calculated",
        description: "Wages derived from work logs and recorded.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate payroll", description: err.message, variant: "destructive" });
    },
  });
}

export function useTogglePayrollApproval() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      togglePayrollApproval(id, approved),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYROLL_KEY });
      toast({ title: "Approval Status Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });
}
