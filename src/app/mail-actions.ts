"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { sendMail } from "@/lib/mail";

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Envoie un mail (nouveau ou réponse) depuis la boîte pro. */
export async function sendMailAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  await requireUser();
  const to = String(formData.get("to") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const subject = String(formData.get("subject") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const inReplyTo = String(formData.get("inReplyTo") ?? "").trim() || undefined;
  const references = String(formData.get("references") ?? "").split(" ").map((s) => s.trim()).filter(Boolean);

  if (!to.length || to.some((t) => !EMAIL.test(t))) return { error: "Adresse du destinataire invalide." };
  if (!subject) return { error: "Il manque l'objet." };
  if (!text) return { error: "Le message est vide." };

  try {
    await sendMail({ to: to.join(", "), subject, text, inReplyTo, references: references.length ? references : undefined });
  } catch (e) {
    return { error: `Envoi impossible : ${errorMessage(e)}` };
  }
  revalidatePath("/mails");
  redirect("/mails?ok=envoye");
}
