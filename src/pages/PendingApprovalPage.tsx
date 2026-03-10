import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const PendingApprovalPage = () => {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
          <Clock className="w-10 h-10 text-warning" />
        </div>
        <div>
          <h1 className="text-2xl font-serif text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            Your account <span className="font-medium text-foreground">{user?.email}</span> has been created and is awaiting approval from the farm owner/admin. You'll have full access once approved.
          </p>
        </div>
        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
};

export default PendingApprovalPage;
