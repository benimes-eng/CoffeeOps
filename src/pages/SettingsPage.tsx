import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { useRole, ROLE_LABELS } from "@/hooks/use-role";
import { toast } from "@/hooks/use-toast";
import {
  Shield, UserCog, Trash2, UserPlus, CheckCircle, XCircle,
  Clock, AlertTriangle, ChevronDown, Users, Building2, Pause, Play,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logAudit } from "@/services/auditService";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// Roles the farm owner can assign (not super_admin â€” that's system-level)
const ASSIGNABLE_ROLES: AppRole[] = ["owner", "manager", "supervisor", "addis_warehouse", "worker"];

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_admin: "Full system access across all organizations",
  owner: "Full farm access â€” can manage users, roles, and all operations",
  manager: "Operations access â€” can manage lots, workers, grinding, and shipments",
  supervisor: "Site access â€” can manage beds, log drying progress, and view reports",
  addis_warehouse: "Addis Ababa hub access â€” can receive and dispatch shipments",
  worker: "Field worker â€” can view assigned beds and log daily work",
};

const ROLE_COLOR: Record<AppRole, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/20",
  owner: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  supervisor: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  addis_warehouse: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  worker: "bg-muted text-muted-foreground border-border",
};

interface ManagedUser {
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  is_suspended: boolean;
  roles: { id: string; role: AppRole }[];
}

const SettingsPage = () => {
  const { user } = useAuth();
  const { orgId, orgName } = useOrg();
  const { isOwner, isManager, isSuperAdmin } = useRole();
  const queryClient = useQueryClient();

  // Can manage users = owner or super admin
  const canManageUsers = isOwner || isSuperAdmin;

  // â”€â”€ Fetch all org users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: allUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["all-org-users", orgId],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (rolesErr) throw rolesErr;

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, name, email, is_approved");
      if (profErr) throw profErr;

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const userMap = new Map<string, ManagedUser>();

      roles.forEach((r) => {
        if (!userMap.has(r.user_id)) {
          const profile = profileMap.get(r.user_id);
          userMap.set(r.user_id, {
            user_id: r.user_id,
            name: profile?.name ?? "Unknown",
            email: profile?.email ?? "",
            is_approved: profile?.is_approved ?? true,
            is_suspended: !(profile?.is_approved ?? true),
            roles: [],
          });
        }
        userMap.get(r.user_id)!.roles.push({ id: r.id, role: r.role as AppRole });
      });

      // Also include profiles that have no roles yet
      profiles.forEach((p) => {
        if (!userMap.has(p.user_id)) {
          userMap.set(p.user_id, {
            user_id: p.user_id,
            name: p.name,
            email: p.email ?? "",
            is_approved: p.is_approved,
            is_suspended: !p.is_approved,
            roles: [],
          });
        }
      });

      return Array.from(userMap.values());
    },
    enabled: canManageUsers,
  });

  const pendingUsers = allUsers?.filter((u) => !u.is_approved) ?? [];
  const activeUsers = allUsers?.filter((u) => u.is_approved) ?? [];

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ── Mutations ──────────────────────────────────────────────────
  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "approve", userId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to approve user");
      await logAudit("approve_user", "user", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-org-users"] });
      toast({ title: "User approved — they can now access the system" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const suspendUser = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: suspend ? "suspend" : "approve", userId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update user status");
      await logAudit(suspend ? "suspend_user" : "unsuspend_user", "user", userId);
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["all-org-users"] });
      toast({ title: suspend ? "User suspended — access revoked" : "User reactivated — access restored" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      await logAudit("reject_user", "user", userId);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "delete", userId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to reject user");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-org-users"] }); toast({ title: "User rejected and removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Change a user's primary role authoritatively via manage-users edge function
  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole; existingRoleIds: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "assign_role", userId, role: newRole }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update role");
      await logAudit("change_role", "user", userId, { role: newRole });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-org-users"] }); toast({ title: "Role updated successfully" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
      await logAudit("delete", "user", userId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-org-users"] }); toast({ title: "User removed from the system" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // â”€â”€ Create User Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      await logAudit("create", "user", result.user?.id, { email: newUserEmail, role: newUserRole });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-org-users"] });
      toast({ title: "User created", description: "They will appear in Pending Approvals until you approve them." });
      setShowCreateUser(false);
      setNewUserEmail(""); setNewUserName(""); setNewUserRole("worker"); setNewUserPassword("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // â”€â”€ Delete confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [confirmDelete, setConfirmDelete] = useState<ManagedUser | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration and access control</p>
      </div>

      <div className="max-w-4xl space-y-6">

        {/* Farm Details */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="font-serif text-lg">Farm Details</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Organization</label>
              <input type="text" defaultValue={orgName || "CoffeeOps Estate"} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" readOnly />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Currency</label>
              <input type="text" value="ETB â€” Ethiopian Birr" className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" readOnly />
            </div>
          </div>
        </div>

        {/* Drying Parameters */}
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Drying Parameters</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Role Reference Card */}
        {canManageUsers && (
          <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-serif text-lg">Access Roles Reference</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ASSIGNABLE_ROLES.map((role) => (
                <div key={role} className={`flex gap-3 rounded-lg border p-3 ${ROLE_COLOR[role]}`}>
                  <div className="flex-1">
                    <p className="text-xs font-semibold">{ROLE_LABELS[role]}</p>
                    <p className="text-[11px] opacity-75 mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User & Role Management â€” owner/superadmin only */}
        {canManageUsers && (
          <>
            {/* Pending Approvals */}
            {pendingUsers.length > 0 && (
              <div className="bg-card rounded-xl p-6 card-shadow border-2 border-warning/40">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-warning" />
                  <h3 className="font-serif text-lg">Pending Approvals</h3>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning font-semibold">{pendingUsers.length} waiting</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  These accounts were created but are waiting for your approval before they can log in.
                </p>
                <div className="space-y-3">
                  {pendingUsers.map((u) => (
                    <div key={u.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 border border-warning/20 bg-warning/5 rounded-lg p-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {u.roles.map((r) => (
                            <span key={r.id} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROLE_COLOR[r.role]}`}>
                              {ROLE_LABELS[r.role]}
                            </span>
                          ))}
                          {u.roles.length === 0 && <span className="text-[10px] text-muted-foreground">No role assigned</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={() => approveUser.mutate(u.user_id)} disabled={approveUser.isPending} className="gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(u)} className="gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Users */}
            <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h3 className="font-serif text-lg">User Access Control</h3>
                </div>
                <Button size="sm" onClick={() => setShowCreateUser(true)} className="gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Add User
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Assign roles, suspend accounts, or remove users. Role changes take effect on the user's next page load.
              </p>

              {usersLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading usersâ€¦</p>
              ) : activeUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active users yet. Add one above.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {activeUsers.map((u) => {
                    const primaryRole = u.roles[0]?.role ?? null;
                    const isCurrentUser = u.user_id === user?.id;
                    const isSuspended = !u.is_approved;
                    return (
                      <div key={u.user_id} className={`py-4 first:pt-0 last:pb-0 ${isSuspended ? "opacity-60" : ""}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {/* User info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold truncate">{u.name}</p>
                              {isCurrentUser && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">You</span>
                              )}
                              {isSuspended && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">Suspended</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>

                          {/* Role selector */}
                          {!isCurrentUser && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Select
                                value={primaryRole ?? ""}
                                onValueChange={(val) =>
                                  changeRole.mutate({
                                    userId: u.user_id,
                                    newRole: val as AppRole,
                                    existingRoleIds: u.roles.map((r) => r.id),
                                  })
                                }
                              >
                                <SelectTrigger className={`h-8 text-xs w-44 font-medium border ${primaryRole ? ROLE_COLOR[primaryRole] : "text-muted-foreground"}`}>
                                  <UserCog className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                                  <SelectValue placeholder="Assign roleâ€¦" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                      <div>
                                        <p className="font-medium">{ROLE_LABELS[r]}</p>
                                        <p className="text-[10px] text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {/* Suspend / Reactivate */}
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-8 gap-1.5 text-xs ${isSuspended ? "text-success border-success/30 hover:bg-success/10" : "text-warning border-warning/30 hover:bg-warning/10"}`}
                                onClick={() => suspendUser.mutate({ userId: u.user_id, suspend: !isSuspended })}
                                disabled={suspendUser.isPending}
                                title={isSuspended ? "Reactivate user" : "Suspend user"}
                              >
                                {isSuspended ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                {isSuspended ? "Activate" : "Suspend"}
                              </Button>

                              {/* Remove user */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmDelete(u)}
                                title="Remove user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Role badge row (read-only display) */}
                        {primaryRole && (
                          <div className="mt-2 ml-0">
                            <span className={`inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full border font-medium ${ROLE_COLOR[primaryRole]}`}>
                              {ROLE_LABELS[primaryRole]}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Non-owners see their own role */}
        {!canManageUsers && isManager && (
          <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-serif text-lg">Your Access Level</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Contact the farm owner to change your role or manage other users.
            </p>
          </div>
        )}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Add New User</DialogTitle>
            <DialogDescription>Create a login account for a team member. They'll need your approval before accessing the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="user@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="e.g. Abebe Girma" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Access Role <span className="text-destructive">*</span></Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      <div>
                        <p className="font-medium">{ROLE_LABELS[r]}</p>
                        <p className="text-[10px] text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password <span className="text-xs text-muted-foreground font-normal">(optional â€” auto-generated if blank)</span></Label>
              <Input type="password" placeholder="Set a temporary password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
            </div>
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
              The user will have <strong className="text-foreground mx-0.5">Pending</strong> status until you approve them from this page. They cannot log in until approved.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancel</Button>
            <Button onClick={() => createUser.mutate()} disabled={!newUserEmail.trim() || createUser.isPending}>
              {createUser.isPending ? "Creatingâ€¦" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Remove/Reject User */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete their account and revoke all access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) {
                  if (confirmDelete.is_approved) {
                    deleteUser.mutate(confirmDelete.user_id);
                  } else {
                    rejectUser.mutate(confirmDelete.user_id);
                  }
                  setConfirmDelete(null);
                }
              }}
            >
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};


export default SettingsPage;
