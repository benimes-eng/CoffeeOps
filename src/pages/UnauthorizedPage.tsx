import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useRole, ROLE_LABELS } from "@/hooks/use-role";

const UnauthorizedPage = () => {
  const navigate = useNavigate();
  const { highestRole } = useRole();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldX className="w-8 h-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-serif text-foreground">Access Denied</h1>
      <p className="text-muted-foreground max-w-md">
        You don't have permission to view this page.
        {highestRole && (
          <> Your current role is <span className="font-medium text-foreground">{ROLE_LABELS[highestRole]}</span>. Contact your administrator to request access.</>
        )}
      </p>
      <Button onClick={() => navigate("/")} variant="outline">
        Back to Dashboard
      </Button>
    </div>
  );
};

export default UnauthorizedPage;
