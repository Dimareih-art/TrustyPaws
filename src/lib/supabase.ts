import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "VITE_SUPABASE_URL не найден"
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_ANON_KEY не найден"
  );
}

console.log(
  "Supabase URL:",
  supabaseUrl
);

console.log(
  "Supabase key loaded:",
  Boolean(supabaseAnonKey)
);

export const supabase =
  createClient(
    supabaseUrl,
    supabaseAnonKey
  );