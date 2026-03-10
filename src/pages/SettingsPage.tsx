import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { toast } from "@/hooks/use-toast";
import { Shield, UserCog, Trash2, UserPlus, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
const ROLES: AppRole[] = ["owner", "manager", "supervisor", "worker"];

const SettingsPage = () => {
  const { user } = useAuth();
  const { orgId, orgName } = useOrg();
  const queryClient = useQueryClient();

  const { data: currentUserRoles } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!user,
  });

  const isOwner = currentUserRoles?.includes("owner") ?? false;

  const { data: allUserRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("id, user_id, role");
      if (rolesErr) throw rolesErr;
      const { data: profiles, error: profErr } = await supabase.from("profiles").select("user_id, name, email");
      if (profErr) throw profErr;
      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const userMap = new Map<string, { user_id: string; name: string; email: string; roles: { id: string; role: AppRole }[] }>();
      roles.forEach((r) => {
        if (!userMap.has(r.user_id)) {
          const profile = profileMap.get(r.user_id);
          userMap.set(r.user_id, { user_id: r.user_id, name: profile?.name ?? "Unknown", email: profile?.email ?? "", roles: [] });
        }
        userMap.get(r.user_id)!.roles.push({ id: r.id, role: r.role });
      });
      return Array.from(userMap.values());
    },
    enabled: isOwner,
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-user-roles"] }); toast({ title: "Role added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-user-roles"] }); toast({ title: "Role removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // User management
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("worker");
  const [newUserPassword, setNewUserPassword] = useState("");

  const createUser = useMutation({
    mutationFn: async () => {
      if (!newUserEmail.trim()) throw new Error("Email required");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "create", email: newUserEmail.trim(), name: newUserName.trim(), role: newUserRole, password: newUserPassword || undefined }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create user");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast({ title: "User created successfully" });
      setShowCreateUser(false);
      setNewUserEmail(""); setNewUserName(""); setNewUserRole("worker"); setNewUserPassword("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "delete", userId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to delete user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast({ title: "User deleted" });
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
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Farm Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Organization</label>
              <input type="text" defaultValue={orgName || "My Farm"} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" readOnly />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Currency</label>
              <input type="text" value="ETB - Ethiopian Birr" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" readOnly />
            </div>
          </div>
        </div>

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

        {isOwner && (
          <>
            {/* User Management */}
            <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-serif text-lg">User & Role Management</h3>
                </div>
                <Button size="sm" onClick={() => setShowCreateUser(true)} className="gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Add User
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Create, delete, and manage roles for users in your organization.
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
                        <div className="flex gap-2">
                          <button onClick={() => setAddingRoleFor(addingRoleFor === u.user_id ? null : u.user_id)} className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors">
                            <UserCog className="w-3.5 h-3.5 inline mr-1" /> Add Role
                          </button>
                          {u.user_id !== user?.id && (
                            <button onClick={() => { if (confirm(`Delete user ${u.name}?`)) deleteUser.mutate(u.user_id); }} className="text-xs px-3 py-1.5 bg-destructive/10 text-destructive rounded-md hover:bg-destructive/20 transition-colors">
                              <UserX className="w-3.5 h-3.5 inline mr-1" /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {u.roles.map((r) => (
                          <span key={r.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${r.role === "owner" ? "bg-primary/15 text-primary" : r.role === "manager" ? "bg-accent/50 text-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                            {r.role}
                            {u.user_id !== user?.id && (
                              <button onClick={() => removeRole.mutate(r.id)} className="hover:text-destructive transition-colors ml-0.5" title="Remove role">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {addingRoleFor === u.user_id && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as AppRole)} className="px-3 py-1.5 bg-background border border-input rounded-lg text-sm">
                            {ROLES.filter((r) => !u.roles.some((ur) => ur.role === r)).map((r) => (<option key={r} value={r}>{r}</option>))}
                          </select>
                          <Button size="sm" onClick={() => { addRole.mutate({ userId: u.user_id, role: selectedRole }); setAddingRoleFor(null); }}>Confirm</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddingRoleFor(null)}>Cancel</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create User Dialog */}
            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle className="font-serif">Add New User</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input placeholder="user@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => (<SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Password (optional)</Label>
                    <Input type="password" placeholder="Auto-generated if empty" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancel</Button>
                  <Button onClick={() => createUser.mutate()} disabled={createUser.isPending}>
                    {createUser.isPending ? "Creating..." : "Create User"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
