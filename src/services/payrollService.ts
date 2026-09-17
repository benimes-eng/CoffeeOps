import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";
import { WorkLogInput, workLogSchema, PayrollGenerateInput, payrollGenerateSchema } from "@/validation/schemas";

export async function fetchWorkLogs(workerId?: string) {
  let query = supabase
    .from("work_logs")
    .select("*, workers(name, role)")
    .order("date", { ascending: false })
    .limit(100);

  if (workerId) query = query.eq("worker_id", workerId);

  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function recordWorkLog(input: WorkLogInput) {
  const validated = workLogSchema.parse(input);

  const { data: worker, error: workerErr } = await supabase
    .from("workers")
    .select("organization_id")
    .eq("id", validated.workerId)
    .single();

  if (workerErr || !worker) throw new Error("Worker not found");

  const { data, error } = await supabase
    .from("work_logs")
    .insert({
      organization_id: worker.organization_id,
      worker_id: validated.workerId,
      activity_type: validated.activityType,
      hours_worked: validated.hoursWorked,
      date: validated.date,
    })
    .select()
    .single();

  if (error) throw parseSupabaseError(error);
  return data;
}

export async function generatePayrollFromLogs(input: PayrollGenerateInput) {
  const validated = payrollGenerateSchema.parse(input);

  const { data, error } = await supabase.rpc("fn_generate_payroll", {
    p_worker_id: validated.workerId,
    p_period_start: validated.periodStart,
    p_period_end: validated.periodEnd,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

export async function togglePayrollApproval(id: string, _currentApproval: boolean) {
  const { data, error } = await supabase.rpc("fn_approve_payroll", {
    p_payroll_id: id,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

