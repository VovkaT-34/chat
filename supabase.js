const SUPABASE_URL = "https://txqcnzmmhnmobrqiuhmu.supabase.co";

//const SUPABASE_URL = "https://txqcnzmmhnmobrqiuhmu.supabase.co/rest/v1";

const SUPABASE_KEY = "sb_publishable_ShcAZajiG3F9cuCTV2ZvEQ_pwO6f5A6";


window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
