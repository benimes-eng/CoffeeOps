import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

// Role hierarchy: super_admin > owner > manager > addis_warehouse > supervisor > worker
const ROLE_HIERARCHY: Record<AppRole, number> = {
  super_admin: 5,
  owner: 4,
  manager: 3,
  addis_warehouse: 3,
  supervisor: 2,
  worker: 1,
};

// Role display labels
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  owner: "Farm Owner / Admin",
  manager: "Operations Manager",
  addis_warehouse: "Addis Ababa Logistics Hub",
  supervisor: "Site Owner",
  worker: "Field Worker",
};

// Define which routes each role can access
const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  "/": ["super_admin", "owner", "manager", "supervisor", "worker", "addis_warehouse"],
  "/hub-inventory": ["super_admin", "owner", "manager", "addis_warehouse"],
  "/sites": ["super_admin", "owner", "manager", "supervisor"],
  "/beds": ["super_admin", "owner", "manager", "supervisor", "worker"],
  "/warehouse": ["super_admin", "owner", "manager"],
  "/grinding": ["super_admin", "owner", "manager"],
  "/shipments": ["super_admin", "owner", "manager", "addis_warehouse"],
  "/workers": ["super_admin", "owner", "manager"],
  "/payroll": ["super_admin", "owner", "manager"],
  "/inventory": ["super_admin", "owner", "manager"],
  "/reports": ["super_admin", "owner", "manager", "supervisor", "addis_warehouse"],
  "/audit-log": ["super_admin", "owner"],
  "/settings": ["super_admin", "owner"],
  "/super-admin": ["super_admin"],
};

export function useRole() {
  const { user } = useAuth();

  const { data: roles, isLoading } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      if (!user) return [] as AppRole[];

      const [rolesResult, profileResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (rolesResult.error) {
        throw rolesResult.error;
      }

      const rolesList: AppRole[] = (rolesResult.data || []).map((r) => r.role);
      if (profileResult.data?.is_super_admin && !rolesList.includes("super_admin")) {
        rolesList.push("super_admin");
      }

      return rolesList;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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

  const isSuperAdmin = hasRole("super_admin") || userRoles.includes("super_admin" as AppRole);
  const isOwner = hasRole("owner") || isSuperAdmin;
  const isManager = hasRole("manager") || isOwner;
  const isAddisWarehouse = hasRole("addis_warehouse");
  const isSupervisor = hasRole("supervisor");
  const isWorker = hasRole("worker") && !isOwner && !isManager && !isSupervisor && !isAddisWarehouse;

  return {
    roles: userRoles,
    highestRole,
    isLoading,
    hasRole,
    hasMinRole,
    canAccessRoute,
    isSuperAdmin,
    isOwner,
    isManager,
    isAddisWarehouse,
    isSupervisor,
    isWorker,
    ROUTE_PERMISSIONS,
  };
}
