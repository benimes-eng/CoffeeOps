import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Coffee, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  // Super Admin Bootstrap State
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [bootstrapEmail, setBootstrapEmail] = useState("superadmin@coffeeops.internal");
  const [bootstrapPassword, setBootstrapPassword] = useState("Password123!");
  const [bootstrapSecret, setBootstrapSecret] = useState("CoffeeOps@SuperAdmin2026!");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw new Error(error.message || "Invalid email or password.");
        }

        if (next) {
          window.location.href = next;
        } else {
          navigate("/");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: name.trim(),
              org_name: orgName.trim() || undefined,
            },
          },
        });

        if (error) {
          throw new Error(error.message || "Failed to create account.");
        }

        // If session is immediately returned, proceed to app
        if (data.session) {
          toast({
            title: "Account Created",
            description: "Your registration has been submitted and is ready for platform review.",
          });
          if (next) {
            window.location.href = next;
          } else {
            navigate("/");
          }
          return;
        }

        // If session was not returned (e.g. email verification enabled on Supabase),
        // invoke backend auto-confirm RPC so user can sign in immediately
        try {
          await supabase.rpc("fn_auto_confirm_user", { p_email: email.trim() });
        } catch {
          // Ignore RPC error if not yet applied
        }

        // Automatically sign in with credentials
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInErr) {
          toast({
            title: "Account Registered",
            description: "Registration complete. Please sign in with your credentials.",
          });
          setIsLogin(true);
        } else {
          toast({
            title: "Account Registered",
            description: "Registration complete. Awaiting administrator approval.",
          });
          if (next) {
            window.location.href = next;
          } else {
            navigate("/");
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Authentication Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSuperAdminAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setBootstrapLoading(true);
    try {
      const cleanEmail = bootstrapEmail.trim();
      // 1. Ensure user exists in auth.users
      await supabase.auth.signUp({
        email: cleanEmail,
        password: bootstrapPassword,
        options: {
          data: { name: "Platform Super Admin" },
        },
      });

      // 2. Invoke bootstrap RPC to auto-confirm email and grant superadmin
      const { error: rpcError } = await supabase.rpc("fn_bootstrap_super_admin", {
        p_email: cleanEmail,
        p_secret: bootstrapSecret,
      });

      if (rpcError) {
        if (rpcError.message.includes("schema cache") || rpcError.message.includes("fn_bootstrap_super_admin")) {
          throw new Error("Database setup required: Please execute the bootstrap SQL snippet in your Supabase SQL Editor once (see instructions).");
        }
        throw new Error(rpcError.message);
      }

      // 3. Sign in
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: bootstrapPassword,
      });

      if (signInErr) {
        throw new Error(signInErr.message);
      }

      toast({
        title: "Super Admin Authenticated",
        description: "Welcome to Platform Administration.",
      });

      window.location.href = "/super-admin";
    } catch (err: unknown) {
      const error = err as Error;
      toast({
        title: "Super Admin Access Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Coffee className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">CoffeeOps</h1>
          <p className="text-muted-foreground mt-1">Ethiopian Coffee Post-Harvest Management Platform</p>
        </div>

        <div className="bg-card rounded-2xl p-8 card-shadow border border-border/50">
          <h2 className="font-serif text-xl mb-6">{isLogin ? "Sign In" : "Register Farm Account"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Organization / Farm Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required={!isLogin}
                    className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Yirgacheffe Highland Estate"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={!isLogin}
                    className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Abebe Bikila"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@domain.com"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-medium hover:underline ml-1"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </p>

          {/* Super Admin Access & Bootstrap Section */}
          <div className="mt-8 pt-6 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowSuperAdminModal(!showSuperAdminModal)}
              className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium py-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Super Administrator Access & Credentials</span>
            </button>

            {showSuperAdminModal && (
              <form onSubmit={handleSuperAdminAccess} className="mt-4 p-4 rounded-xl bg-muted/40 border border-border/80 space-y-3 animate-fade-in text-left">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Direct Super Admin Access</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Instantly authenticates and routes to <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">/super-admin</code> with platform oversight privileges.
                </p>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Super Admin Email</label>
                  <input
                    type="email"
                    value={bootstrapEmail}
                    onChange={(e) => setBootstrapEmail(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Password</label>
                  <input
                    type="password"
                    value={bootstrapPassword}
                    onChange={(e) => setBootstrapPassword(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Master Key</label>
                  <input
                    type="password"
                    value={bootstrapSecret}
                    onChange={(e) => setBootstrapSecret(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={bootstrapLoading}
                  className="w-full py-2 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                >
                  {bootstrapLoading ? "Connecting to Super Admin..." : "Sign In to Super Admin Dashboard"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
