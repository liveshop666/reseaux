import type { MediaType, Network } from "@/lib/networks";

export type TargetStatus = "a_publier" | "en_cours" | "publie" | "erreur" | "annule";

export type Target = {
  id: string;
  post_id: string;
  network: Network;
  title: string | null;
  text: string;
  status: TargetStatus;
  scheduled_at: string;
  claimed_at: string | null;
  published_at: string | null;
  external_id: string | null;
  url: string | null;
  is_private: boolean;
  error: string | null;
};

export type Post = {
  id: string;
  created_at: string;
  body: string;
  media_url: string | null;
  media_path: string | null;
  media_type: MediaType;
  scheduled_at: string;
  social_targets?: Target[];
};

export type Account = {
  network: Network;
  enabled: boolean;
  handle: string | null;
  profile_url: string | null;
  linkedin_mode: "personne" | "page";
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

/** Texte adapté à un réseau (aperçu). */
export type Adapted = { title?: string; text: string };
export type AdaptedMap = Partial<Record<Network, Adapted>>;

/** Statut global d'un post, calculé à partir de ses réseaux. */
export type PostStatus = "programme" | "en_cours" | "publie" | "partiel" | "erreur" | "annule";
