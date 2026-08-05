import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_inventory",
  title: "List inventory & machinery",
  description: "List inventory items and machinery with quantity, location and service status.",
  inputSchema: {
    category: z.string().optional().describe("Optional inventory category filter."),
    limit: z.number().int().optional().describe("Max items to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("inventory_items")
      .select("id, name, category, quantity, unit, location, status, last_service_date")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (category) query = query.eq("category", category as never);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { items: data ?? [] } };
  },
});
