import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_shipments",
  title: "List shipments",
  description: "List outgoing coffee shipments with destination, weight and status.",
  inputSchema: {
    status: z.string().optional().describe("Optional shipment status filter."),
    limit: z.number().int().optional().describe("Max shipments to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("shipments")
      .select("id, destination, weight, status, shipment_date, confirmed_at, lot_id")
      .order("shipment_date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { shipments: data ?? [] } };
  },
});
