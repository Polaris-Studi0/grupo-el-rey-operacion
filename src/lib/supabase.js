import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const forceDemo = import.meta.env.VITE_DEMO_MODE === "true";
export const isDemoMode = forceDemo || !url || !anonKey || url.includes("TU_PROYECTO") || anonKey.includes("TU_CLAVE");

export const supabase = isDemoMode
  ? null
  : createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } }
    });
