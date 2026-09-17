import { Clock, AlertTriangle, LogOut, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface SubscriptionSuspendedPageProps {
  orgName?: string;
  monthlyRate?: number;
  nextBillingDate?: string;
}

const SubscriptionSuspendedPage = ({
  orgName = "Coffee Farm",
  monthlyRate = 5000,
}: SubscriptionSuspendedPageProps) => {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in bg-card p-8 rounded-2xl border border-destructive/30 card-shadow">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-3 py-1 rounded-full">
            Subscription Suspended
          </span>
          <h1 className="text-2xl font-serif text-foreground mt-3">Access Temporarily Suspended</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            The subscription for <strong className="text-foreground">{orgName}</strong> is past due or suspended by the platform administration.
          </p>
        </div>

        <div className="bg-muted/40 p-4 rounded-xl text-left text-xs space-y-2 border border-border/50">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account:</span>
            <span className="font-mono text-foreground">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Fee:</span>
            <span className="font-semibold text-foreground">{Number(monthlyRate).toLocaleString()} ETB / month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <span className="text-destructive font-medium uppercase">Payment Required</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Please contact the CoffeeOps Super Administrator or your farm finance manager to settle your monthly invoice and reactivate system access.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="outline"
            onClick={signOut}
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionSuspendedPage;
