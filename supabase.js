const SUPABASE_URL = "https://sxkukrqjtgkxmzuzondm.supabase.co";

const SUPABASE_KEY = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N";

window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
