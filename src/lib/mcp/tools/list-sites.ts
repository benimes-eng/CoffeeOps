import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_sites",
  title: "List sites",
  description: "List coffee farm sites (and their blocks) for the signed-in user's organization.",
  inputSchema: { limit: z.number().int().optional().describe("Max sites to return (default 50).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, location, created_at, blocks(id, name)")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { sites: data ?? [] } };
  },
});
