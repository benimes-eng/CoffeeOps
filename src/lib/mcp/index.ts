import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSites from "./tools/list-sites";
import listBeds from "./tools/list-beds";
import listLots from "./tools/list-lots";
import listInventory from "./tools/list-inventory";
import listWorkers from "./tools/list-workers";
import listShipments from "./tools/list-shipments";
import farmSummary from "./tools/farm-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "coffee-harvest-hub",
  title: "Coffee Harvest Hub",
  version: "0.1.0",
  instructions:
    "Tools for Coffee Harvest Hub, a coffee farm post-harvest operations app. Read sites, drying beds, coffee lots, inventory and machinery, workers, shipments, and an overall farm summary. All data is scoped to the signed-in user's organization.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [farmSummary, listSites, listBeds, listLots, listInventory, listWorkers, listShipments],
});
