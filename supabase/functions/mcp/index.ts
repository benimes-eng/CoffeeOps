// CoffeeOps MCP Server Supabase Edge Function
// Portable cross-platform Deno implementation with zero local filesystem dependencies

import { auth, defineMcp, defineTool } from "npm:@lovable.dev/mcp-js@0.26.1";
import { createSupabaseHandler } from "npm:@lovable.dev/mcp-js@0.26.1/stacks/supabase";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.24.2";

function supabaseForUser(ctx: { getToken: () => string | undefined }) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 1. Farm Summary Tool
const farmSummary = defineTool({
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

// 2. List Sites Tool
const listSites = defineTool({
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

// 3. List Beds Tool
const listBeds = defineTool({
  name: "list_beds",
  title: "List drying beds",
  description: "List drying beds, their current status, dimensions, surface area, and active batch assignments.",
  inputSchema: {
    status: z.string().optional().describe("Filter by bed status: empty, occupied, maintenance."),
    limit: z.number().int().optional().describe("Max beds to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("beds")
      .select("id, bed_number, status, length, width, surface_area, block_id, blocks(name, site_id, sites(name)), bed_assignments(id, lot_id, assigned_weight, assigned_date, expected_completion, is_active)")
      .order("bed_number")
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { beds: data ?? [] } };
  },
});

// 4. List Lots Tool
const listLots = defineTool({
  name: "list_lots",
  title: "List coffee lots",
  description: "List coffee lots with origin region, initial and current weight, status, intake date, and quality notes.",
  inputSchema: {
    status: z.string().optional().describe("Filter lot status: received, drying, ready_for_grinding, grinding, ready_for_shipment, shipped, merged."),
    limit: z.number().int().optional().describe("Max lots to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("lots")
      .select("id, lot_number, region, initial_weight, current_weight, status, intake_date, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { lots: data ?? [] } };
  },
});

// 5. List Inventory Tool
const listInventory = defineTool({
  name: "list_inventory",
  title: "List inventory",
  description: "List warehouse inventory items, machinery, spare parts, and stock quantities.",
  inputSchema: {
    category: z.string().optional().describe("Optional category filter."),
    limit: z.number().int().optional().describe("Max inventory items to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("inventory_items")
      .select("id, name, category, quantity, unit, reorder_level, location, updated_at")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 100, 1), 300));
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { inventory: data ?? [] } };
  },
});

// 6. List Workers Tool (NO WAGE OR COMPENSATION DATA)
const listWorkers = defineTool({
  name: "list_workers",
  title: "List workers",
  description: "List farm workers with name, role and active operational status. Does not expose compensation or wage rates.",
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
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { workers: data ?? [] } };
  },
});

// 7. List Shipments Tool
const listShipments = defineTool({
  name: "list_shipments",
  title: "List shipments",
  description: "List export shipments, consignment weights, status, and destinations.",
  inputSchema: {
    status: z.string().optional().describe("Optional shipment status filter: preparing, in_transit, arrived, confirmed."),
    limit: z.number().int().optional().describe("Max shipments to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("shipments")
      .select("id, shipment_number, destination, weight, status, shipment_date, confirmed_at, lots(lot_number, region)")
      .order("shipment_date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 100, 1), 200));
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { shipments: data ?? [] } };
  },
});

const projectRef = Deno.env.get("VITE_SUPABASE_PROJECT_ID") || "project-ref";

const mcpServer = defineMcp({
  name: "coffee-harvest-hub",
  title: "Coffee Harvest Hub",
  version: "1.0.0",
  instructions:
    "Authoritative read-only tools for CoffeeOps multi-tenant SaaS. Scoped strictly to the authenticated user's organization.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [farmSummary, listSites, listBeds, listLots, listInventory, listWorkers, listShipments],
});

Deno.serve(createSupabaseHandler(mcpServer, { functionName: "mcp" }));
