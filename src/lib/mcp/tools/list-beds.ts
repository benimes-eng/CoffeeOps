import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_beds",
  title: "List drying beds",
  description: "List drying beds with status, dimensions and current assignments.",
  inputSchema: {
    status: z.string().optional().describe("Optional bed status filter, e.g. empty, occupied, maintenance."),
    limit: z.number().int().optional().describe("Max beds to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("beds")
      .select("id, bed_number, status, length, width, surface_area, material_type, block_id")
      .order("bed_number")
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { beds: data ?? [] } };
  },
});
