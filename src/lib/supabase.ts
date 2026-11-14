import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && anonKey);

// Keep the login screen renderable before local credentials are configured.
// App prevents auth and data requests when configuration is missing.
export const supabase = createClient(
  url || "https://unconfigured.supabase.co",
  anonKey || "unconfigured",
);

