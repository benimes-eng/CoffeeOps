import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/services/auditService";
import { format } from "date-fns";
import {
  ShieldCheck, Users, Building2, CheckCircle, XCircle, Clock,
  Coffee, LogOut, BarChart3, ClipboardList, Calendar, User, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/dashboard/MetricCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UserWithOrg = {
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  is_super_admin: boolean;
  organization_id: string;
  org_name: string;
  roles: string[];
  created_at: string;
};

const SuperAdminDashboard = () => {
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "all" | "audit">("pending");
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "reject" | "suspend" | "reactivate"; user: UserWithOrg } | null>(null);

  // Fetch all profiles, orgs, roles
  const { data: allUsers, isLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, name, email, is_approved, is_super_admin, organization_id, created_at");
      if (profErr) throw profErr;

      const { data: orgs, error: orgErr } = await supabase.from("organizations").select("id, name");
      if (orgErr) throw orgErr;

      const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("user_id, role");
      if (rolesErr) throw rolesErr;

      const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
      const roleMap = new Map<string, string[]>();
      roles.forEach((r) => {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      });

      return profiles.map((p): UserWithOrg => ({
        user_id: p.user_id,
        name: p.name,
        email: p.email ?? "",
        is_approved: (p as any).is_approved ?? true,
        is_super_admin: (p as any).is_super_admin ?? false,
        organization_id: p.organization_id,
        org_name: orgMap.get(p.organization_id) ?? "Unknown",
        roles: roleMap.get(p.user_id) ?? [],
        created_at: p.created_at,
      }));
    },
  });

  // Fetch audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ["super-admin-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = [...new Set(data.map((l: any) => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((log: any) => ({
        ...log,
        user_name: profileMap.get(log.user_id)?.name ?? "Unknown",
      }));
    },
    enabled: tab === "audit",
  });

  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true } as any)
        .eq("user_id", userId);
      if (error) throw error;
      await logAudit("approve_user", "user", userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "Farm owner approved successfully" });
      setConfirmAction(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectUser = useMutation({
    mutationFn: async (userId: string) => {
      await logAudit("reject_user", "user", userId);
      // Delete profile and roles — user can no longer access
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("profiles").delete().eq("user_id", userId) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "User rejected and removed" });
      setConfirmAction(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const nonSuperUsers = allUsers?.filter((u) => !u.is_super_admin) ?? [];
  const pendingUsers = nonSuperUsers.filter((u) => !u.is_approved);
  const approvedUsers = nonSuperUsers.filter((u) => u.is_approved);
  const uniqueOrgs = new Set(nonSuperUsers.map((u) => u.organization_id));
  const farmOwners = nonSuperUsers.filter((u) => u.roles.includes("owner"));

  const filtered = (list: UserWithOrg[]) =>
    list.filter((u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.org_name.toLowerCase().includes(search.toLowerCase())
    );

  const actionLabels: Record<string, { label: string; color: string }> = {
    create: { label: "Created", color: "bg-success/10 text-success" },
    update: { label: "Updated", color: "bg-primary/10 text-primary" },
    delete: { label: "Deleted", color: "bg-destructive/10 text-destructive" },
    approve_user: { label: "Approved", color: "bg-success/10 text-success" },
    reject_user: { label: "Rejected", color: "bg-destructive/10 text-destructive" },
    assign_role: { label: "Role Assigned", color: "bg-primary/10 text-primary" },
    remove_role: { label: "Role Removed", color: "bg-warning/10 text-warning" },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Coffee className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-serif text-lg text-foreground leading-tight">CoffeeOps</h1>
            <p className="text-[10px] text-muted-foreground">Super Admin Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide bg-primary/15 text-primary">
            <ShieldCheck className="w-3 h-3" /> Super Admin
          </span>
          <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6 animate-fade-in">
        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Organizations"
            value={uniqueOrgs.size}
            icon={<Building2 className="w-4 h-4" />}
          />
          <MetricCard
            title="Farm Owners"
            value={farmOwners.length}
            icon={<Users className="w-4 h-4" />}
          />
          <MetricCard
            title="Pending Approvals"
            value={pendingUsers.length}
            icon={<Clock className="w-4 h-4" />}
          />
          <MetricCard
            title="Total Users"
            value={nonSuperUsers.length}
            icon={<BarChart3 className="w-4 h-4" />}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {([
            { key: "pending", label: "Pending", icon: Clock, count: pendingUsers.length },
            { key: "approved", label: "Approved", icon: CheckCircle },
            { key: "all", label: "All Users", icon: Users },
            { key: "audit", label: "Audit Log", icon: ClipboardList },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {"count" in t && t.count! > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== "audit" && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or organization..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Content */}
        {tab === "audit" ? (
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            {auditLogs && auditLogs.length > 0 ? (
              <div className="divide-y divide-border/50">
                {auditLogs.map((log: any) => {
                  const meta = actionLabels[log.action] ?? { label: log.action, color: "bg-muted text-muted-foreground" };
                  return (
                    <div key={log.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{log.user_name}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${meta.color}`}>{meta.label}</span>
                            <span className="text-xs text-muted-foreground capitalize">{log.entity_type}</span>
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">No audit logs yet</p>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-12">Loading...</p>
            ) : (
              <>
                {(() => {
                  const list =
                    tab === "pending" ? filtered(pendingUsers) :
                    tab === "approved" ? filtered(approvedUsers) :
                    filtered(nonSuperUsers);

                  if (list.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Users className="w-10 h-10 mb-3 opacity-40" />
                        <p className="text-sm">
                          {tab === "pending" ? "No pending approvals" : "No users found"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organization</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Roles</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                            <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                            <th className="px-5 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((u) => (
                            <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-sm">{u.org_name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex flex-wrap gap-1">
                                  {u.roles.map((r) => (
                                    <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                                      r === "owner" ? "bg-primary/15 text-primary" :
                                      r === "manager" ? "bg-accent text-accent-foreground" :
                                      "bg-muted text-muted-foreground"
                                    }`}>{r}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                {u.is_approved ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-success/10 text-success">
                                    <CheckCircle className="w-3 h-3" /> Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-warning/10 text-warning">
                                    <Clock className="w-3 h-3" /> Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-muted-foreground">
                                {format(new Date(u.created_at), "MMM d, yyyy")}
                              </td>
                              <td className="px-5 py-3.5">
                                {!u.is_approved && (
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => setConfirmAction({ type: "approve", user: u })} className="gap-1 h-7 text-xs">
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ type: "reject", user: u })} className="gap-1 h-7 text-xs">
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {confirmAction?.type === "approve" ? "Approve User" : "Reject User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve"
                ? `Approve ${confirmAction.user.name} (${confirmAction.user.email}) from ${confirmAction.user.org_name}? They will gain full access to their organization.`
                : `Reject and remove ${confirmAction?.user.name} (${confirmAction?.user.email})? This will delete their account and organization.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction?.type === "approve") {
                  approveUser.mutate(confirmAction.user.user_id);
                } else if (confirmAction?.type === "reject") {
                  rejectUser.mutate(confirmAction!.user.user_id);
                }
              }}
              className={confirmAction?.type === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmAction?.type === "approve" ? "Approve" : "Reject & Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminDashboard;
