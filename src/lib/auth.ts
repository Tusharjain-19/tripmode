import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Current session; `undefined` while loading on the client. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth
      .getSession()
      .then(({ data: d }) => setSession(d.session))
      .catch(() => setSession(null));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Guests get a hidden per-device ID so trip access rules still apply. No sign-in screen. */
let guestPromise: Promise<void> | null = null;
export function ensureGuest() {
  guestPromise ??= (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message);
    } catch (err) {
      // Retry once after short delay
      await new Promise((r) => setTimeout(r, 600));
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message);
    }
  })().finally(() => {
    guestPromise = null;
  });
  return guestPromise;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** True when the signed-in account has the admin role (checked by the backend). */
export async function isAdmin(userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}
