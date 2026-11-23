import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { errorMessage } from "@/lib/format";
import { NETWORKS, NETWORK_INFO, blockReason, type MediaType, type Network } from "@/lib/networks";
import { BUCKET, createPostCore, mediaPathFromUrl, notReadyMessage, notReadyNetworks } from "@/lib/post-core";

export const MODEL = "claude-opus-5-5";

export function systemPrompt(): string {
  const reseaux = NETWORKS.map((n) => {
    const i = NETWORK_INFO[n];
    return `- ${n} (${i.label}) : ${i.max} caractères max${i.titleMax ? `, titre ${i.titleMax} max` : ""}. Accepte : ${[i.accepts.text && "texte", i.accepts.image && "photo", i.accepts.video && "vidéo"].filter(Boolean).join(", ")}${i.needs === "video" ? " — vidéo OBLIGATOIRE" : i.needs === "media" ? " — photo ou vidéo OBLIGATOIRE" : ""}. ${i.limit}`;
  }).join("\n");

  return `Tu es l'assistant du Studio Réseaux de SolveLab, une agence digitale française (sites internet, automatisation et IA, outils et logiciels sur mesure, publicité et marketing digital). Tu parles à son fondateur, dans une conversation façon Claude Code : il écrit des instructions, il envoie des photos et des vidéos, et tu fais le travail pour ses réseaux sociaux : YouTube, TikTok, Instagram, LinkedIn et la fiche Google.

# Ce que tu fais
- Tu écris et adaptes les textes réseau par réseau (ton, longueur, hashtags, appel à l'action) à partir de ses instructions. Tu n'inventes jamais de prix, de client, de date ou de résultat qu'il ne t'a pas donné ; s'il manque une info utile, tu poses une seule question courte.
- Tu regardes les photos qu'il envoie. Une vidéo jointe apparaît sous forme de lien : tu ne peux pas la regarder, mais tu peux la publier et en écrire la description d'après ce qu'il t'en dit.
- Tu peux monter une vidéo verticale (9:16) à partir de ses photos et vidéos avec l'outil monter_video (textes à l'écran, transitions). Le montage se fait dans son navigateur et le résultat te revient dans un message.
- Tu prépares un brouillon avec proposer_post : il s'affiche en aperçu par réseau. Tu peux le refaire autant de fois qu'il veut.
- Tu publies avec publier, **uniquement** quand il a clairement validé un brouillon que tu as déjà proposé (« je valide », « vas-y publie », « publie sur YouTube et TikTok »…). S'il valide seulement certains réseaux, publie seulement ceux-là. Jamais de publication de ta propre initiative, jamais dans le même tour que le brouillon. Un doute = tu demandes.
- Tu peux lui dire ce qui a été publié, ce qui est programmé et ce qui est en erreur (etat_publications, etat_comptes).

# Règles par réseau
${reseaux}

# Façon de répondre
- Français, tutoiement, ton direct et chaleureux, court. Tu dis ce que tu fais et ce que tu as fait (« Brouillon prêt pour YouTube et TikTok, dis-moi si tu valides »). Pas de longs textes autour des aperçus : les textes sont dans les cartes.
- Si une publication échoue ou si un réseau est bloqué (compte pas branché, vidéo manquante…), dis-le simplement avec la solution.
- Les publications partent par n8n : après publier, dis que c'est lancé ; le statut réel et les liens se voient dans l'onglet du réseau.
- Date et heure sont en heure de Paris (Europe/Paris). Pour programmer, donne une date ISO 8601 avec fuseau.`;
}

/* ------------------------------------------------------------------ */
/* Définition des outils                                               */
/* ------------------------------------------------------------------ */

const networkEnum = NETWORKS;

export const TOOLS = [
  {
    name: "proposer_post",
    description: "Prépare un brouillon de publication (rien n'est publié). Affiche un aperçu par réseau à l'utilisateur. Un texte adapté par réseau.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        texte_base: { type: "string", description: "Le message de fond, en une ou deux phrases (sert d'archive)." },
        media_url: { type: "string", description: "Lien exact de la photo ou vidéo à publier, tel que donné par l'utilisateur ou par le montage. Chaîne vide s'il n'y a pas de média." },
        media_type: { type: "string", enum: ["image", "video", "aucun"] },
        reseaux: {
          type: "array",
          items: {
            type: "object",
            properties: {
              reseau: { type: "string", enum: [...networkEnum] },
              titre: { type: "string", description: "Titre YouTube (100 max). Chaîne vide pour les autres réseaux." },
              texte: { type: "string", description: "Texte final prêt à publier pour ce réseau." },
            },
            required: ["reseau", "titre", "texte"],
            additionalProperties: false,
          },
        },
      },
      required: ["texte_base", "media_url", "media_type", "reseaux"],
      additionalProperties: false,
    },
  },
  {
    name: "publier",
    description: "Publie un brouillon déjà proposé, SEULEMENT après validation explicite de l'utilisateur dans un message qui suit le brouillon. Peut se limiter à certains réseaux et peut être programmé.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Identifiant renvoyé par proposer_post." },
        reseaux: { type: "array", items: { type: "string", enum: [...networkEnum] }, description: "Réseaux validés. Liste vide = tous ceux du brouillon." },
        quand: { type: "string", description: "Date ISO 8601 avec fuseau pour programmer. Chaîne vide = tout de suite." },
      },
      required: ["draft_id", "reseaux", "quand"],
      additionalProperties: false,
    },
  },
  {
    name: "monter_video",
    description: "Monte une vidéo verticale 9:16 dans le navigateur de l'utilisateur à partir de photos/vidéos déjà envoyées (diaporama avec textes à l'écran et transitions). Le résultat (lien de la vidéo) arrive dans un message suivant : termine ton tour juste après l'appel.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        clips: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Lien exact du média." },
              type: { type: "string", enum: ["image", "video"] },
              texte: { type: "string", description: "Texte à l'écran (court). Chaîne vide si aucun." },
              duree: { type: "number", description: "Secondes à l'écran (2 à 8)." },
            },
            required: ["url", "type", "texte", "duree"],
            additionalProperties: false,
          },
        },
        texte_final: { type: "string", description: "Carte finale (ex. nom et site). Chaîne vide si aucune." },
      },
      required: ["clips", "texte_final"],
      additionalProperties: false,
    },
  },
  {
    name: "etat_publications",
    description: "Liste les dernières publications avec leur statut, leur lien et leurs erreurs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reseau: { type: "string", enum: [...networkEnum, "tous"] },
        limite: { type: "integer", description: "Nombre maximum (1 à 20)." },
      },
      required: ["reseau", "limite"],
      additionalProperties: false,
    },
  },
  {
    name: "etat_comptes",
    description: "État de chaque réseau : branché ou non, dernière publication réussie, dernière erreur.",
    strict: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

/* ------------------------------------------------------------------ */
/* Exécution                                                           */
/* ------------------------------------------------------------------ */

const ProposerInput = z.object({
  texte_base: z.string(),
  media_url: z.string(),
  media_type: z.enum(["image", "video", "aucun"]),
  reseaux: z.array(z.object({ reseau: z.enum(networkEnum), titre: z.string(), texte: z.string() })).min(1),
});
const PublierInput = z.object({ draft_id: z.string().uuid(), reseaux: z.array(z.enum(networkEnum)), quand: z.string() });
const MontageInput = z.object({
  clips: z.array(z.object({ url: z.string(), type: z.enum(["image", "video"]), texte: z.string(), duree: z.number() })).min(1).max(12),
  texte_final: z.string(),
});
const EtatInput = z.object({ reseau: z.enum([...networkEnum, "tous"]), limite: z.number().int() });

export type DraftPayload = {
  texte_base: string;
  media_url: string | null;
  media_type: MediaType;
  reseaux: { reseau: Network; titre: string; texte: string }[];
};

export type ToolContext = {
  supabase: SupabaseClient;
  conversationId: string;
  /** Date du dernier message de l'utilisateur dans cette conversation (ISO). */
  lastUserAt: string;
};

export type ToolOutcome = { content: string; isError?: boolean; montage?: z.infer<typeof MontageInput> };

const ok = (data: unknown): ToolOutcome => ({ content: JSON.stringify(data) });
const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

function checkMediaUrl(url: string): boolean {
  return !!mediaPathFromUrl(url);
}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "proposer_post": {
        const p = ProposerInput.safeParse(input);
        if (!p.success) return fail("Brouillon invalide : " + p.error.issues.map((i) => i.message).join("; "));
        const mediaType: MediaType = p.data.media_type === "aucun" || !p.data.media_url ? null : p.data.media_type;
        if (p.data.media_url && !checkMediaUrl(p.data.media_url)) return fail("media_url inconnu : utilise exactement un lien reçu de l'utilisateur ou du montage.");
        const problems: string[] = [];
        for (const r of p.data.reseaux) {
          const info = NETWORK_INFO[r.reseau];
          const block = blockReason(r.reseau, mediaType);
          if (block) problems.push(block);
          if (r.texte.length > info.max) problems.push(`${info.label} : ${r.texte.length} caractères, maximum ${info.max}.`);
          if (r.reseau === "youtube" && (!r.titre.trim() || r.titre.length > (info.titleMax ?? 100))) problems.push("YouTube : titre manquant ou trop long.");
        }
        const missing = await notReadyNetworks(ctx.supabase, p.data.reseaux.map((r) => r.reseau));
        if (missing.length) problems.push(notReadyMessage(missing));
        if (problems.length) return fail("Brouillon refusé, corrige : " + problems.join(" "));
        const payload: DraftPayload = { texte_base: p.data.texte_base, media_url: p.data.media_url || null, media_type: mediaType, reseaux: p.data.reseaux };
        const { data, error } = await ctx.supabase.from("social_drafts").insert({ conversation_id: ctx.conversationId, payload }).select("id").single();
        if (error) throw error;
        return ok({ draft_id: data.id, statut: "brouillon_affiche_a_l_utilisateur", rappel: "Rien n'est publié. Attends sa validation." });
      }

      case "publier": {
        const p = PublierInput.safeParse(input);
        if (!p.success) return fail("Paramètres invalides.");
        const { data: draft } = await ctx.supabase.from("social_drafts").select("*").eq("id", p.data.draft_id).maybeSingle();
        if (!draft) return fail("Brouillon introuvable.");
        if (draft.conversation_id !== ctx.conversationId) return fail("Ce brouillon n'appartient pas à cette conversation.");
        if (draft.post_id) return fail("Ce brouillon a déjà été publié.");
        // Garde-fou : il faut qu'un message de l'utilisateur soit arrivé APRÈS l'affichage du brouillon.
        if (new Date(draft.created_at).getTime() >= new Date(ctx.lastUserAt).getTime()) {
          return fail("Le brouillon vient d'être proposé : l'utilisateur ne l'a pas encore validé. Montre-le et attends son message.");
        }
        const payload = draft.payload as DraftPayload;
        const wanted = p.data.reseaux.length ? p.data.reseaux : payload.reseaux.map((r) => r.reseau);
        const targets = payload.reseaux.filter((r) => wanted.includes(r.reseau)).map((r) => ({ network: r.reseau, title: r.titre, text: r.texte }));
        if (!targets.length) return fail("Aucun des réseaux demandés n'est dans le brouillon.");
        const res = await createPostCore(ctx.supabase, {
          body: payload.texte_base, mediaUrl: payload.media_url, mediaType: payload.media_type,
          scheduledAt: p.data.quand.trim() || null, targets,
        });
        if (!res.ok) return fail(res.error);
        await ctx.supabase.from("social_drafts").update({ post_id: res.id }).eq("id", draft.id);
        return ok({ lance: true, programme: res.scheduled, reseaux: res.networks, post_id: res.id, avertissement: res.note ?? null });
      }

      case "monter_video": {
        const p = MontageInput.safeParse(input);
        if (!p.success) return fail("Montage invalide.");
        if (p.data.clips.some((c) => !checkMediaUrl(c.url))) return fail("Un lien de média est inconnu : utilise exactement les liens reçus.");
        return {
          content: "Le montage démarre dans le navigateur de l'utilisateur. Dis une courte phrase pour l'annoncer ; le lien de la vidéo te sera envoyé dans le prochain message.",
          montage: p.data,
        };
      }

      case "etat_publications": {
        const p = EtatInput.safeParse(input);
        if (!p.success) return fail("Paramètres invalides.");
        let q = ctx.supabase.from("social_targets")
          .select("network, status, url, error, is_private, scheduled_at, published_at, text")
          .order("scheduled_at", { ascending: false }).limit(Math.min(Math.max(p.data.limite, 1), 20));
        if (p.data.reseau !== "tous") q = q.eq("network", p.data.reseau);
        const { data, error } = await q;
        if (error) throw error;
        return ok((data ?? []).map((t) => ({ ...t, text: String(t.text).slice(0, 140) })));
      }

      case "etat_comptes": {
        const { data, error } = await ctx.supabase.from("social_accounts").select("network, enabled, last_ok_at, last_error, last_error_at, linkedin_mode");
        if (error) throw error;
        return ok(data);
      }

      default:
        return fail(`Outil inconnu : ${name}`);
    }
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export { BUCKET };
