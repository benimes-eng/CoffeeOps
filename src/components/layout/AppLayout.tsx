import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useRole, ROLE_LABELS } from "@/hooks/use-role";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, MapPin, Grid3X3, Warehouse, Users, DollarSign, Wrench, BarChart3, Settings,
  ChevronLeft, Coffee, Menu, LogOut, Bell, Truck, Shield, ClipboardList, Building2,
} from "lucide-react";

const navItems = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Addis Ababa Hub", path: "/hub-inventory", icon: Building2 },
  { title: "Sites & Fields", path: "/sites", icon: MapPin },
  { title: "Bed Management", path: "/beds", icon: Grid3X3 },
  { title: "Warehouse", path: "/warehouse", icon: Warehouse },
  { title: "Grinding", path: "/grinding", icon: Coffee },
  { title: "Shipments", path: "/shipments", icon: Truck },
  { title: "Workers", path: "/workers", icon: Users },
  { title: "Payroll", path: "/payroll", icon: DollarSign },
  { title: "Inventory & Machinery", path: "/inventory", icon: Wrench },
  { title: "Reports", path: "/reports", icon: BarChart3 },
  { title: "Audit Log", path: "/audit-log", icon: ClipboardList },
  { title: "Settings", path: "/settings", icon: Settings },
  { title: "Platform Super Admin", path: "/super-admin", icon: Shield },
];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { canAccessRoute } = useRole();

  const filteredNav = navItems.filter((item) => canAccessRoute(item.path));

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground z-40 transition-all duration-200 flex flex-col border-r border-sidebar-border ${collapsed ? "w-[68px]" : "w-64"}`}>
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border bg-sidebar/50">
        <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Coffee className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="font-sans font-bold text-base tracking-tight text-white leading-tight">CoffeeOps</h1>
              <span className="text-[9px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">PRO</span>
            </div>
            <p className="text-[11px] text-sidebar-foreground/60 font-medium tracking-wide">Enterprise Agribusiness</p>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white"
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-white" : "text-sidebar-foreground/60 group-hover:text-white"}`} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Action */}
      <button onClick={onToggle} className="flex items-center justify-center h-12 border-t border-sidebar-border text-sidebar-muted hover:text-sidebar-foreground transition-colors">
        <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
      </button>
    </aside>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = notifications?.filter((n) => !n.is_read).length || 0;
  const typeIcon: Record<string, string> = { warning: "🟡", success: "🟢", info: "🔵" };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 transition-colors">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-lg border border-border shadow-lg z-50 max-h-96 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50/50 dark:bg-slate-900/50">
              <h4 className="font-semibold text-xs tracking-wider uppercase text-slate-500">Notifications</h4>
              {unread > 0 && (
                <button onClick={() => markAllRead.mutate()} className="text-xs text-primary hover:underline font-medium">Mark all read</button>
              )}
            </div>
            <div className="overflow-y-auto max-h-72 divide-y divide-border/60">
              {notifications && notifications.length > 0 ? notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!n.is_read ? "bg-emerald-500/5" : ""}`}
                >
                  <div className="flex gap-2.5">
                    <span className="text-sm">{typeIcon[n.type] || "🔵"}</span>
                    <div className="min-w-0">
                      <p className={`text-xs ${!n.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              )) : (
                <p className="text-xs text-muted-foreground text-center py-6">No notifications</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const roleBadgeColor: Record<string, string> = {
  super_admin: "bg-purple-500/10 text-purple-700 border-purple-200 dark:border-purple-800 dark:text-purple-300",
  owner: "bg-emerald-500/10 text-emerald-800 border-emerald-200 dark:border-emerald-800 dark:text-emerald-300",
  manager: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  supervisor: "bg-amber-500/10 text-amber-800 border-amber-200 dark:border-amber-800 dark:text-amber-300",
  addis_warehouse: "bg-blue-500/10 text-blue-700 border-blue-200 dark:border-blue-800 dark:text-blue-300",
  worker: "bg-slate-100 text-slate-600 border-slate-200",
};

export function AppHeader({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const { user, signOut } = useAuth();
  const { highestRole } = useRole();
  const initials = user?.email?.slice(0, 2).toUpperCase() || "OP";

  return (
    <header className="h-16 bg-card border-b border-border/80 flex items-center justify-between px-6 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-sans font-bold text-base text-foreground tracking-tight">Specialty Coffee Supply Chain Operations</h2>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Washing Station Telemetry
              </span>
              <span>•</span>
              <span className="font-mono">Ethiopia Origin Nodes</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        {highestRole && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border font-semibold tracking-wide ${roleBadgeColor[highestRole] || "bg-muted text-muted-foreground"}`}>
            <Shield className="w-3 h-3" />
            {ROLE_LABELS[highestRole]}
          </span>
        )}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
          <div className="w-8 h-8 rounded bg-slate-900 text-white dark:bg-emerald-700 flex items-center justify-center font-bold text-xs">
            {initials}
          </div>
          <div className="text-left leading-none">
            <p className="text-xs font-semibold text-foreground truncate max-w-[140px]">{user?.email}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Authorized Node</p>
          </div>
        </div>
        <button onClick={signOut} className="p-2 rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 text-muted-foreground transition-colors" title="Sign out">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`transition-all duration-200 ${collapsed ? "ml-[68px]" : "ml-64"}`}>
        <AppHeader sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
