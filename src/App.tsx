import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "./pages/Dashboard";
import SitesPage from "./pages/SitesPage";
import BedManagement from "./pages/BedManagement";
import WarehousePage from "./pages/WarehousePage";
import WorkersPage from "./pages/WorkersPage";
import PayrollPage from "./pages/PayrollPage";
import InventoryPage from "./pages/InventoryPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import GrindingPage from "./pages/GrindingPage";
import ShipmentPage from "./pages/ShipmentPage";
import AuditLogPage from "./pages/AuditLogPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";

const queryClient = new QueryClient();

function RoleGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { canAccessRoute, isLoading } = useRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Loading permissions...</p>
      </div>
    );
  }

  if (!canAccessRoute(path)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
}

function ProtectedRoutes() {
  const { session, loading, user } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile-approval", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("is_approved")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Gate unapproved users
  if (profile && !(profile as any).is_approved) {
    return <PendingApprovalPage />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<RoleGuard path="/"><Dashboard /></RoleGuard>} />
        <Route path="/sites" element={<RoleGuard path="/sites"><SitesPage /></RoleGuard>} />
        <Route path="/beds" element={<RoleGuard path="/beds"><BedManagement /></RoleGuard>} />
        <Route path="/warehouse" element={<RoleGuard path="/warehouse"><WarehousePage /></RoleGuard>} />
        <Route path="/workers" element={<RoleGuard path="/workers"><WorkersPage /></RoleGuard>} />
        <Route path="/payroll" element={<RoleGuard path="/payroll"><PayrollPage /></RoleGuard>} />
        <Route path="/inventory" element={<RoleGuard path="/inventory"><InventoryPage /></RoleGuard>} />
        <Route path="/grinding" element={<RoleGuard path="/grinding"><GrindingPage /></RoleGuard>} />
        <Route path="/shipments" element={<RoleGuard path="/shipments"><ShipmentPage /></RoleGuard>} />
        <Route path="/reports" element={<RoleGuard path="/reports"><ReportsPage /></RoleGuard>} />
        <Route path="/audit-log" element={<RoleGuard path="/audit-log"><AuditLogPage /></RoleGuard>} />
        <Route path="/settings" element={<RoleGuard path="/settings"><SettingsPage /></RoleGuard>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <AuthPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthRoute />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
