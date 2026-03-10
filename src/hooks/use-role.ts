import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

// Role hierarchy: owner > manager > supervisor > worker
const ROLE_HIERARCHY: Record<AppRole, number> = {
  owner: 4,
  manager: 3,
  supervisor: 2,
  worker: 1,
};

// Role display labels
export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Admin",
  manager: "Manager",
  supervisor: "Site Owner",
  worker: "Worker",
};

// Define which routes each role can access
const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  "/": ["owner", "manager", "supervisor", "worker"],
  "/sites": ["owner", "manager", "supervisor"],
  "/beds": ["owner", "manager", "supervisor", "worker"],
  "/warehouse": ["owner", "manager"],
  "/grinding": ["owner", "manager"],
  "/shipments": ["owner", "manager"],
  "/workers": ["owner", "manager"],
  "/payroll": ["owner", "manager"],
  "/inventory": ["owner", "manager"],
  "/reports": ["owner", "manager", "supervisor"],
  "/audit-log": ["owner"],
  "/settings": ["owner"],
};

export function useRole() {
  const { user } = useAuth();

  const { data: roles, isLoading } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!user,
  });

  const userRoles = roles ?? [];

  // Get the highest role
  const highestRole: AppRole | null = userRoles.length > 0
    ? userRoles.reduce((best, r) => ROLE_HIERARCHY[r] > ROLE_HIERARCHY[best] ? r : best)
    : null;

  const hasRole = (role: AppRole) => userRoles.includes(role);

  const hasMinRole = (minRole: AppRole) => {
    if (!highestRole) return false;
    return ROLE_HIERARCHY[highestRole] >= ROLE_HIERARCHY[minRole];
  };

  const canAccessRoute = (path: string) => {
    const allowed = ROUTE_PERMISSIONS[path];
    if (!allowed) return true; // Unknown routes are accessible
    return userRoles.some((r) => allowed.includes(r));
  };

  const isOwner = hasRole("owner");
  const isManager = hasRole("manager");
  const isSupervisor = hasRole("supervisor");
  const isWorker = hasRole("worker") && !isOwner && !isManager && !isSupervisor;

  return {
    roles: userRoles,
    highestRole,
    isLoading,
    hasRole,
    hasMinRole,
    canAccessRoute,
    isOwner,
    isManager,
    isSupervisor,
    isWorker,
    ROUTE_PERMISSIONS,
  };
}
