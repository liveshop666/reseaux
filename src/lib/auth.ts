import "server-only";
import { createClient } from "@/lib/supabase/server";

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Client Supabase de l'utilisateur connecté, refusé s'il n'est pas dans ALLOWED_EMAILS. */
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const allowed = allowedEmails();
  if (!user || (allowed.length > 0 && !allowed.includes((user.email ?? "").toLowerCase()))) {
    throw new Error("Accès refusé : reconnecte-toi.");
  }
  return supabase;
}
