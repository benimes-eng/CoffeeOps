import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Shield, UserCog, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
const ROLES: AppRole[] = ["owner", "manager", "supervisor", "worker"];

const SettingsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if current user is owner
  const { data: currentUserRoles } = useQuery({
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

  const isOwner = currentUserRoles?.includes("owner") ?? false;

  // Fetch all user roles with profile info
  const { data: allUserRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (rolesErr) throw rolesErr;

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, name, email");
      if (profErr) throw profErr;

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      // Group by user
      const userMap = new Map<string, { user_id: string; name: string; email: string; roles: { id: string; role: AppRole }[] }>();
      roles.forEach((r) => {
        if (!userMap.has(r.user_id)) {
          const profile = profileMap.get(r.user_id);
          userMap.set(r.user_id, {
            user_id: r.user_id,
            name: profile?.name ?? "Unknown",
            email: profile?.email ?? "",
            roles: [],
          });
        }
        userMap.get(r.user_id)!.roles.push({ id: r.id, role: r.role });
      });

      return Array.from(userMap.values());
    },
    enabled: isOwner,
  });

  // Add role mutation
  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast({ title: "Role added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Remove role mutation
  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast({ title: "Role removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("worker");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration</p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Farm Details */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Farm Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Farm Name</label>
              <input type="text" defaultValue="CoffeeOps Estate" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Region</label>
              <input type="text" defaultValue="Central Kenya" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Currency</label>
              <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option>KES - Kenyan Shilling</option>
                <option>USD - US Dollar</option>
                <option>EUR - Euro</option>
              </select>
            </div>
          </div>
        </div>

        {/* Drying Parameters */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Drying Parameters</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Target Moisture (%)</label>
              <input type="number" defaultValue="11.5" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Standard Drying Days</label>
              <input type="number" defaultValue="14" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        </div>

        <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          Save Settings
        </button>

        {/* Role Management - Owner Only */}
        {isOwner && (
          <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-serif text-lg">Role Management</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Assign roles to control access. Only owners can manage roles.
            </p>

            {rolesLoading ? (
              <p className="text-sm text-muted-foreground">Loading users...</p>
            ) : (
              <div className="space-y-3">
                {(allUserRoles ?? []).map((u) => (
                  <div key={u.user_id} className="border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <button
                        onClick={() => setAddingRoleFor(addingRoleFor === u.user_id ? null : u.user_id)}
                        className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                      >
                        <UserCog className="w-3.5 h-3.5 inline mr-1" />
                        Add Role
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {u.roles.map((r) => (
                        <span
                          key={r.id}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                            r.role === "owner"
                              ? "bg-primary/15 text-primary"
                              : r.role === "manager"
                              ? "bg-accent/50 text-foreground"
                              : r.role === "supervisor"
                              ? "bg-muted text-foreground"
                              : "bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          {r.role}
                          {u.user_id !== user?.id && (
                            <button
                              onClick={() => removeRole.mutate(r.id)}
                              className="hover:text-destructive transition-colors ml-0.5"
                              title="Remove role"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    {addingRoleFor === u.user_id && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as AppRole)}
                          className="px-3 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {ROLES.filter((r) => !u.roles.some((ur) => ur.role === r)).map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            addRole.mutate({ userId: u.user_id, role: selectedRole });
                            setAddingRoleFor(null);
                          }}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setAddingRoleFor(null)}
                          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
