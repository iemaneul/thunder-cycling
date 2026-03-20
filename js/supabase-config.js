(function () {
  const SUPABASE_URL = "https://gtcqxpscpmlwxzfwzvpc.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_UjeRqTi3PEJsFA0rpaWhJQ_2O33K8PP";

  const configIsReady =
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR-PROJECT") &&
    !!SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

  const supabaseClient = configIsReady
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  window.BCSupabase = {
    supabase: supabaseClient,
    assertSupabase() {
      if (!supabaseClient) {
        throw new Error(
          "Configure o arquivo js/supabase-config.js com a URL e a anon key do seu projeto Supabase."
        );
      }

      return supabaseClient;
    }
  };
})();
