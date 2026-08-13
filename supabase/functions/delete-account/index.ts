import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Grab the billing reference before user_credits is removed below, so we can
  // cancel any active Lemon Squeezy subscription and stop future charges.
  const { data: creditRow } = await admin
    .from("user_credits")
    .select("ls_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const lsSubscriptionId = creditRow?.ls_subscription_id ?? null;

  const { error: summariesError } = await admin
    .from("summaries")
    .delete()
    .eq("user_id", user.id);
  if (summariesError) {
    console.error("failed to delete summaries:", summariesError);
    return jsonResponse({ error: "Failed to delete your data. Please try again." }, 500);
  }

  const { error: usageError } = await admin
    .from("analysis_usage")
    .delete()
    .eq("user_id", user.id);
  if (usageError) {
    console.error("failed to delete analysis_usage:", usageError);
  }

  const { error: creditsError } = await admin
    .from("user_credits")
    .delete()
    .eq("user_id", user.id);
  if (creditsError) {
    console.error("failed to delete user_credits:", creditsError);
  }

  const { error: settingsError } = await admin
    .from("user_settings")
    .delete()
    .eq("user_id", user.id);
  if (settingsError) {
    console.error("failed to delete user_settings:", settingsError);
  }

  // Best-effort: remove avatar files so storage never outlives the account.
  try {
    const bucket = admin.storage.from("avatars");
    // Storage lists at most `limit` objects per call; keep paging until a
    // short page proves the folder is drained so no files are ever left
    // behind. Any list/remove error breaks the loop — never spin forever.
    for (;;) {
      const { data: avatarFiles, error: listError } = await bucket.list(
        user.id,
        { limit: 100 },
      );
      if (listError) {
        console.error("failed to list avatar files:", listError);
        break;
      }
      if (!avatarFiles || avatarFiles.length === 0) break;
      const { error: removeError } = await bucket.remove(
        avatarFiles.map((file) => `${user.id}/${file.name}`),
      );
      if (removeError) {
        console.error("failed to remove avatar files:", removeError);
        break;
      }
      if (avatarFiles.length < 100) break;
    }
  } catch (err) {
    console.error("failed to delete avatar files:", err);
  }

  // Best-effort: cancel the subscription so a deleted account is never
  // charged again. Never block account deletion on billing.
  if (lsSubscriptionId) {
    const lsApiKey = Deno.env.get("LEMONSQUEEZY_API_KEY");
    if (lsApiKey) {
      try {
        const res = await fetch(
          `https://api.lemonsqueezy.com/v1/subscriptions/${lsSubscriptionId}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.api+json",
              Authorization: `Bearer ${lsApiKey}`,
            },
            // A stalled billing API must never hold the function until the
            // platform timeout and block the user's account deletion.
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!res.ok) {
          console.error(
            "failed to cancel Lemon Squeezy subscription:",
            res.status,
            await res.text(),
          );
        }
      } catch (err) {
        console.error("failed to cancel Lemon Squeezy subscription:", err);
      }
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("failed to delete user:", deleteError);
    return jsonResponse({ error: "Failed to delete the account. Please try again." }, 500);
  }

  return jsonResponse({ data: { deleted: true } }, 200);
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
