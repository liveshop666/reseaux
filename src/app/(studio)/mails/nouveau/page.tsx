import Link from "next/link";
import { MailForm } from "@/components/MailForm";
import { PageHeader } from "@/components/ui";
import { mailAddress } from "@/lib/mail";

export default function NouveauMail() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={<>Nouveau <span className="text-warm">mail</span></>} subtitle={`Part de ${mailAddress()}`}
        action={<Link href="/mails" className="btn-ghost">← Mails</Link>} />
      <MailForm />
    </div>
  );
}
