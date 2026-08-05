import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_lots",
  title: "List coffee lots",
  description: "List coffee lots with intake date, region, weights and processing status.",
  inputSchema: {
    status: z.string().optional().describe("Optional lot status filter."),
    limit: z.number().int().optional().describe("Max lots to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("lots")
      .select("id, lot_number, region, status, initial_weight, current_weight, intake_date")
      .order("intake_date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { lots: data ?? [] } };
  },
});
