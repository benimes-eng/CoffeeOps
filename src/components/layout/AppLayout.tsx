import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, MapPin, Grid3X3, Warehouse, Users, DollarSign, Wrench, BarChart3, Settings,
  ChevronLeft, Coffee, Menu, LogOut, Bell,
} from "lucide-react";

const navItems = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Sites & Fields", path: "/sites", icon: MapPin },
  { title: "Bed Management", path: "/beds", icon: Grid3X3 },
  { title: "Warehouse", path: "/warehouse", icon: Warehouse },
  { title: "Grinding", path: "/grinding", icon: Coffee },
  { title: "Shipments", path: "/shipments", icon: Truck },
  { title: "Workers", path: "/workers", icon: Users },
  { title: "Payroll", path: "/payroll", icon: DollarSign },
  { title: "Inventory & Machinery", path: "/inventory", icon: Wrench },
  { title: "Reports", path: "/reports", icon: BarChart3 },
  { title: "Settings", path: "/settings", icon: Settings },
];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground z-40 transition-all duration-300 flex flex-col ${collapsed ? "w-[68px]" : "w-60"}`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Coffee className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-serif text-lg text-sidebar-accent-foreground leading-tight">CoffeeOps</h1>
            <p className="text-[10px] text-sidebar-muted leading-none">Farm Management</p>
          </div>
        )}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
              <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>
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
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl border border-border shadow-lg z-50 max-h-96 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="font-serif text-sm font-medium">Notifications</h4>
              {unread > 0 && (
                <button onClick={() => markAllRead.mutate()} className="text-xs text-primary hover:underline">Mark all read</button>
              )}
            </div>
            <div className="overflow-y-auto max-h-72">
              {notifications && notifications.length > 0 ? notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex gap-2">
                    <span className="text-sm">{typeIcon[n.type] || "🔵"}</span>
                    <div className="min-w-0">
                      <p className={`text-sm ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-6">No notifications yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppHeader({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const { user, signOut } = useAuth();
  const initials = user?.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-muted">
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-serif text-xl text-foreground">Coffee Farm Management</h2>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">{initials}</span>
        </div>
        <button onClick={signOut} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Sign out">
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
      <div className={`transition-all duration-300 ${collapsed ? "ml-[68px]" : "ml-60"}`}>
        <AppHeader sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
