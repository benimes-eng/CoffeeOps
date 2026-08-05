import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "farm_summary",
  title: "Farm summary",
  description: "Overview counts of lots, beds, workers, shipments and grinding batches for the organization.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const tables = ["lots", "beds", "workers", "shipments", "grinding_batches"] as const;
    const summary: Record<string, number | string> = {};
    for (const table of tables) {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
      summary[table] = error ? `error: ${error.message}` : count ?? 0;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: { summary },
    };
  },
});
