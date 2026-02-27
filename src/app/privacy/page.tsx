import Link from "next/link";
import { Section } from "@/components/section";

export default function Page() {
  return (
    <div>
      <Section title="Confidentialité" subtitle="Politique de confidentialité (démo).">
        <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6 text-sm text-smoke">
          Contenu à compléter. Tu peux modifier cette page dans <code className="text-bone">src/app/privacy/page.tsx</code>.
          <div className="mt-4">
            <Link href="/" className="text-champagne">Retour accueil</Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
