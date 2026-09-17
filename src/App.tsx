import { lazy, Suspense } from "react";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const SitesPage = lazy(() => import("./pages/SitesPage"));
const BedManagement = lazy(() => import("./pages/BedManagement"));
const WarehousePage = lazy(() => import("./pages/WarehousePage"));
const WorkersPage = lazy(() => import("./pages/WorkersPage"));
const PayrollPage = lazy(() => import("./pages/PayrollPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const GrindingPage = lazy(() => import("./pages/GrindingPage"));
const ShipmentPage = lazy(() => import("./pages/ShipmentPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const AddisHubPage = lazy(() => import("./pages/AddisHubPage"));
const SubscriptionSuspendedPage = lazy(() => import("./pages/SubscriptionSuspendedPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const UnauthorizedPage = lazy(() => import("./pages/UnauthorizedPage"));
const PendingApprovalPage = lazy(() => import("./pages/PendingApprovalPage"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-muted-foreground animate-pulse">Loading CoffeeOps...</p>
    </div>
  );
}

function RoleGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { canAccessRoute, isLoading } = useRole();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!canAccessRoute(path)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
}

interface ProfileInfo {
  is_approved: boolean;
  is_super_admin: boolean;
  subscription_status: string;
  organization_id: string | null;
  org_name: string | null;
}

function useProfileData() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-profile-full", user?.id],
    queryFn: async (): Promise<ProfileInfo | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("is_approved, is_super_admin, organization_id, organizations(name, subscription_status)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) return null;

      const org = data.organizations as unknown as { name: string; subscription_status: string } | null;

      return {
        is_approved: data.is_approved ?? false,
        is_super_admin: data.is_super_admin ?? false,
        subscription_status: org?.subscription_status || "active",
        organization_id: data.organization_id,
        org_name: org?.name || "CoffeeOps Estate",
      };
    },
    enabled: !!user,
  });
}

function ProtectedRoutes() {
  const { session, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfileData();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Authenticating...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Super admin gets platform oversight dashboard
  if (profile?.is_super_admin) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SuperAdminDashboard />
      </Suspense>
    );
  }

  // Gate unapproved users
  if (profile && !profile.is_approved) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PendingApprovalPage />
      </Suspense>
    );
  }

  // Gate suspended organizations
  if (profile && profile.subscription_status === "suspended") {
    return (
      <Suspense fallback={<PageLoader />}>
        <SubscriptionSuspendedPage orgName={profile.org_name || undefined} />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RoleGuard path="/"><Dashboard /></RoleGuard>} />
          <Route path="/hub-inventory" element={<RoleGuard path="/hub-inventory"><AddisHubPage /></RoleGuard>} />
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
          <Route path="/super-admin" element={<RoleGuard path="/super-admin"><SuperAdminDashboard /></RoleGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

function AuthRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <AuthPage />
    </Suspense>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

