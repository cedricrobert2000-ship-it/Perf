// Your Supabase project (Project Settings → API).
// The "anon public" key is meant to be public: it only allows calling the
// club's functions, never reading the tables directly (see supabase/schema.sql).
//
// Either paste the two values here, or set the repository variables
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY on GitHub (they take precedence).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
