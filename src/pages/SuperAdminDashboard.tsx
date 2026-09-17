import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/services/auditService";
import type { PlatformAuditLog } from "@/services/adminService";
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

type TenantOrg = {
  id: string;
  name: string;
  slug?: string;
  subscription_status: "active" | "past_due" | "suspended";
  monthly_rate: number;
  next_billing_date?: string;
  created_at?: string;
  user_count?: number;
};

const SuperAdminDashboard = () => {
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "subscriptions" | "all" | "audit">("pending");
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "reject" | "suspend" | "reactivate"; user: UserWithOrg } | null>(null);
  const [confirmOrgAction, setConfirmOrgAction] = useState<{ type: "suspend" | "reactivate"; org: TenantOrg } | null>(null);

  // Fetch all organizations with subscription info
  const { data: tenantOrgs, isLoading: orgsLoading } = useQuery({
    queryKey: ["super-admin-orgs"],
    queryFn: async () => {
      const { getAllPlatformOrgs } = await import("@/services/adminService");
      return await getAllPlatformOrgs();
    },
  });

  // Fetch all profiles, orgs, roles
  const { data: allUsers, isLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { getAllPlatformUsers } = await import("@/services/adminService");
      return await getAllPlatformUsers();
    },
  });

  // Fetch audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ["super-admin-audit"],
    queryFn: async () => {
      const { getAllPlatformAuditLogs } = await import("@/services/adminService");
      return await getAllPlatformAuditLogs();
    },
    enabled: tab === "audit",
  });

  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      const { approvePlatformUser } = await import("@/services/adminService");
      await approvePlatformUser(userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      qc.invalidateQueries({ queryKey: ["super-admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin-audit"] });
      toast({ title: "Farm owner approved successfully" });
      setConfirmAction(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectUser = useMutation({
    mutationFn: async (userId: string) => {
      const { rejectPlatformUser } = await import("@/services/adminService");
      await rejectPlatformUser(userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      qc.invalidateQueries({ queryKey: ["super-admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin-audit"] });
      toast({ title: "User rejected and removed" });
      setConfirmAction(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const suspendUser = useMutation({
    mutationFn: async (userId: string) => {
      const { suspendPlatformUser } = await import("@/services/adminService");
      await suspendPlatformUser(userId, false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      qc.invalidateQueries({ queryKey: ["super-admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin-audit"] });
      toast({ title: "Account suspended successfully" });
      setConfirmAction(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateOrgSubscription = useMutation({
    mutationFn: async ({ orgId, status }: { orgId: string; status: "active" | "suspended" }) => {
      const { updateOrgSubscriptionStatus } = await import("@/services/adminService");
      await updateOrgSubscriptionStatus(orgId, status);
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["super-admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin-users"] });
      qc.invalidateQueries({ queryKey: ["super-admin-audit"] });
      toast({
        title: variables.status === "suspended" ? "Organization Suspended" : "Subscription Reactivated",
        description: variables.status === "suspended"
          ? "Users of this farm will be locked out until monthly payment is settled."
          : "Full system access has been restored.",
      });
      setConfirmOrgAction(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
    suspend_user: { label: "Suspended", color: "bg-destructive/10 text-destructive" },
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
            { key: "pending", label: "Pending Users", icon: Clock, count: pendingUsers.length },
            { key: "approved", label: "Approved Users", icon: CheckCircle },
            { key: "subscriptions", label: "Subscriptions & Billing", icon: Building2, count: tenantOrgs?.filter(o => o.subscription_status === "suspended").length },
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
              {"count" in t && (t.count ?? 0) > 0 && (
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
                {auditLogs.map((log: PlatformAuditLog) => {
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
        ) : tab === "subscriptions" ? (
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-semibold">Tenant Subscriptions & Access Control</h3>
                <p className="text-xs text-muted-foreground">Manage recurring monthly SaaS fees and suspend delinquent accounts immediately</p>
              </div>
              <div className="text-xs px-2.5 py-1 rounded bg-muted font-medium text-muted-foreground">
                Default Monthly Rate: 5,000 ETB / farm
              </div>
            </div>
            {orgsLoading ? (
              <p className="text-muted-foreground text-center py-12">Loading tenants...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Farm / Organization</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monthly Rate (ETB)</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing Cycle</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">System Access</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantOrgs && tenantOrgs.length > 0 ? (
                      tenantOrgs.map((org) => {
                        const isSuspended = org.subscription_status === "suspended";
                        const isPastDue = org.subscription_status === "past_due";
                        return (
                          <tr key={org.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  isSuspended ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
                                }`}>
                                  <Building2 className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{org.name}</p>
                                  <p className="text-xs text-muted-foreground">ID: {org.id.slice(0, 8)}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-sm font-mono font-medium">{(org.monthly_rate || 5000).toLocaleString()} ETB</span>
                              <span className="text-[11px] text-muted-foreground block">per calendar month</span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-muted-foreground">
                              {org.next_billing_date
                                ? `Due: ${format(new Date(org.next_billing_date), "MMM d, yyyy")}`
                                : "Auto-renews monthly"}
                            </td>
                            <td className="px-5 py-3.5">
                              {isSuspended ? (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide bg-destructive/15 text-destructive">
                                  <XCircle className="w-3.5 h-3.5" /> Suspended
                                </span>
                              ) : isPastDue ? (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                  <Clock className="w-3.5 h-3.5" /> Past Due (Grace Period)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle className="w-3.5 h-3.5" /> Active & Authorized
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isSuspended ? (
                                <Button
                                  size="sm"
                                  onClick={() => setConfirmOrgAction({ type: "reactivate", org })}
                                  className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" /> Mark Paid / Reactivate
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setConfirmOrgAction({ type: "suspend", org })}
                                  className="gap-1.5 h-8 text-xs font-medium"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Suspend System Access
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                          No tenant organizations found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                                      r === "addis_warehouse" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
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
                                {!u.is_approved ? (
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => setConfirmAction({ type: "approve", user: u })} className="gap-1 h-7 text-xs">
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ type: "reject", user: u })} className="gap-1 h-7 text-xs">
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: "suspend", user: u })} className="gap-1 h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                                    <XCircle className="w-3 h-3" /> Suspend
                                  </Button>
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

      {/* Confirmation Dialog for User */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {confirmAction?.type === "approve" ? "Approve User" :
               confirmAction?.type === "suspend" ? "Suspend Account" :
               confirmAction?.type === "reactivate" ? "Reactivate Account" :
               "Reject User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve"
                ? `Approve ${confirmAction.user.name} (${confirmAction.user.email}) from ${confirmAction.user.org_name}? They will gain full access to their organization.`
                : confirmAction?.type === "suspend"
                ? `Suspend ${confirmAction.user.name} (${confirmAction.user.email})? They will be locked out of their account until reactivated.`
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
                } else if (confirmAction?.type === "suspend") {
                  suspendUser.mutate(confirmAction!.user.user_id);
                }
              }}
              className={confirmAction?.type === "reject" || confirmAction?.type === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmAction?.type === "approve" ? "Approve" :
               confirmAction?.type === "suspend" ? "Suspend Account" :
               "Reject & Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Dialog for Organization Subscription */}
      <AlertDialog open={!!confirmOrgAction} onOpenChange={() => setConfirmOrgAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {confirmOrgAction?.type === "suspend"
                ? "Suspend Farm System Access?"
                : "Reactivate Farm Subscription?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOrgAction?.type === "suspend"
                ? `Are you sure you want to suspend access for ${confirmOrgAction.org.name}? All farmers and managers in this organization will be locked out until monthly billing is settled.`
                : `Reactivate full system access for ${confirmOrgAction?.org.name}? System lockout will be removed immediately.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmOrgAction) return;
                updateOrgSubscription.mutate({
                  orgId: confirmOrgAction.org.id,
                  status: confirmOrgAction.type === "suspend" ? "suspended" : "active",
                });
              }}
              className={confirmOrgAction?.type === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground"}
            >
              {confirmOrgAction?.type === "suspend" ? "Suspend Access" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminDashboard;
