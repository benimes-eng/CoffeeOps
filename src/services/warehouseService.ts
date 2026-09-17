import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";

export interface MergeLotsParams {
  sourceLotIds: string[];
  notes?: string;
}

export async function mergeLots(params: MergeLotsParams) {
  if (params.sourceLotIds.length < 2) {
    throw new Error("Select at least 2 lots to merge");
  }

  const { data, error } = await supabase.rpc("fn_merge_lots", {
    p_source_lot_ids: params.sourceLotIds,
    p_notes: params.notes || null,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

