
const SUPABASE_URL = "https://orerzedneirhykjqtdyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gFk6OpRBgbl9oczAw650IA_72KoG1RU";

const configReady =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_KEY.startsWith("sb_publishable_");

console.log(
  configReady
    ? "Macro Earning: Supabase config ready"
    : "Macro Earning: URL বা Publishable Key বসানো হয়নি"
);
