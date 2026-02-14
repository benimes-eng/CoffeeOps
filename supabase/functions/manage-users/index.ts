import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Check caller is owner
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile) return new Response(JSON.stringify({ error: "No profile found" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const orgId = callerProfile.organization_id;

    const { data: ownerRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", caller.id)
      .eq("role", "owner")
      .eq("organization_id", orgId)
      .single();

    if (!ownerRole) return new Response(JSON.stringify({ error: "Only owners can manage users" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, name, role = "worker", password } = body;
      if (!email) return new Response(JSON.stringify({ error: "Email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: password || Math.random().toString(36).slice(-10) + "A1!",
        email_confirm: true,
        user_metadata: { name: name || email, organization_id: orgId, role },
      });

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ user: { id: data.user.id, email: data.user.email } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { userId } = body;
      if (!userId) return new Response(JSON.stringify({ error: "userId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (userId === caller.id) return new Response(JSON.stringify({ error: "Cannot delete yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Verify user belongs to same org
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .single();

      if (!targetProfile || targetProfile.organization_id !== orgId) {
        return new Response(JSON.stringify({ error: "User not in your organization" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Delete roles and profile first
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'create' or 'delete'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
