import type { SupabaseClient, User } from "@supabase/supabase-js";

export const SETTINGS_KEY = "feedbackloop-settings";

export const DEFAULT_SETTINGS = {
  defaultView: "dashboard" as "dashboard" | "summaries",
};

export type UserSettings = typeof DEFAULT_SETTINGS;

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[];

export function normalizeSettings(raw: unknown): UserSettings {
  const parsed = typeof raw === "object" && raw !== null ? (raw as object) : {};
  const result = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = value;
    }
  }
  return result;
}

export function loadSettingsFromStorage(): UserSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsToStorage(settings: UserSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export async function fetchUserSettings(
  supabase: SupabaseClient,
  user: User,
): Promise<UserSettings> {
  const local = loadSettingsFromStorage();
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return local;

  const remote = normalizeSettings(data.settings);
  saveSettingsToStorage(remote);
  return remote;
}

export async function saveUserSettings(
  supabase: SupabaseClient,
  user: User,
  settings: UserSettings,
): Promise<{ error: string | null }> {
  saveSettingsToStorage(settings);
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      settings: settings as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return { error: error ? error.message : null };
}

export async function resolveDefaultLanding(
  supabase: SupabaseClient,
  user: User,
  fallback: string,
): Promise<string> {
  const settings = await fetchUserSettings(supabase, user);
  return settings.defaultView === "summaries" ? "/summaries" : fallback;
}
