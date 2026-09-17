import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { parseSupabaseError } from "@/lib/errors";
import { LotIntakeInput, lotIntakeSchema } from "@/validation/schemas";

export type Lot = Tables<"lots">;

export interface LotWithDetails extends Lot {
  bed_assignments?: Tables<"bed_assignments">[];
  grinding_batches?: Tables<"grinding_batches">[];
  shipments?: Tables<"shipments">[];
  parent_lots?: Lot[];
}

export async function fetchLots(status?: string): Promise<Lot[]> {
  let query = supabase
    .from("lots")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status as Lot["status"]);
  }

  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data || [];
}

export async function fetchLotById(lotId: string): Promise<LotWithDetails | null> {
  const { data: lot, error } = await supabase
    .from("lots")
    .select("*, bed_assignments(*), grinding_batches(*), shipments(*)")
    .eq("id", lotId)
    .single();

  if (error) throw parseSupabaseError(error);
  if (!lot) return null;

  // If lot was merged from parents, fetch parents for traceability
  let parentLots: Lot[] = [];
  if (lot.parent_lot_ids && lot.parent_lot_ids.length > 0) {
    const { data: parents } = await supabase
      .from("lots")
      .select("*")
      .in("id", lot.parent_lot_ids);
    parentLots = parents || [];
  }

  return {
    ...lot,
    parent_lots: parentLots,
  };
}

export async function createLotIntake(input: LotIntakeInput & { isPurchasedDry?: boolean }): Promise<Lot> {
  const validated = lotIntakeSchema.parse(input);

  // Invoke authoritative PostgreSQL function fn_create_lot (fails closed)
  const { data, error } = await supabase.rpc("fn_create_lot", {
    p_region: validated.region,
    p_initial_weight: validated.initial_weight,
    p_intake_date: validated.intake_date,
    p_notes: validated.notes || null,
    p_is_purchased_dry: input.isPurchasedDry ?? false,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data as unknown as Lot;
}
