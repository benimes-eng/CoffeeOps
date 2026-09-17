import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_workers",
  title: "List workers",
  description: "List farm workers with name, role and active operational status.",
  inputSchema: {
    status: z.string().optional().describe("Optional worker status filter, e.g. active."),
    limit: z.number().int().optional().describe("Max workers to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("workers")
      .select("id, name, role, status")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { workers: data ?? [] } };
  },

});
