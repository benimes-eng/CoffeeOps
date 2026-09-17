import { useState, useEffect } from "react";
import { Clock, LogOut, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PendingApprovalPage = () => {
  const { signOut, user } = useAuth();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    if (!user?.id) return;
    setChecking(true);
    const { data } = await supabase.from("profiles").select("is_approved").eq("id", user.id).single();
    if (data?.is_approved) {
      await qc.invalidateQueries({ queryKey: ["my-profile-full"] });
      window.location.href = "/";
      return;
    }
    await qc.invalidateQueries({ queryKey: ["my-profile-full"] });
    setChecking(false);
  };

  // Auto-check every 4 seconds
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("profiles").select("is_approved").eq("id", user.id).single();
      if (data?.is_approved) {
        await qc.invalidateQueries({ queryKey: ["my-profile-full"] });
        window.location.href = "/";
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [user?.id, qc]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in bg-card p-8 rounded-2xl border border-warning/30 card-shadow">
        <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
          <Clock className="w-10 h-10 text-warning" />
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-warning bg-warning/10 px-3 py-1 rounded-full">
            Under Review
          </span>
          <h1 className="text-2xl font-serif text-foreground mt-3">Account Pending Approval</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Your account <span className="font-semibold text-foreground">{user?.email}</span> has been created and is awaiting approval from the platform administrator. You'll gain instant access once your account is verified.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={checkStatus} disabled={checking} className="w-full gap-2">
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Check Approval Status"}
          </Button>

          <Button variant="outline" onClick={signOut} className="w-full gap-2 text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalPage;

