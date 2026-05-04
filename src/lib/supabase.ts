import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getUrlHost(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

export function getSupabaseDebugInfo() {
  return {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    urlHost: getUrlHost(supabaseUrl),
    anonKeyLength: supabaseAnonKey?.length ?? 0,
    anonKeyPrefix: supabaseAnonKey?.slice(0, 14) ?? "",
  };
}

if (import.meta.env.DEV) {
  console.info("[supabase] env", getSupabaseDebugInfo());
}

export const supabase = isSupabaseConfigured && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
