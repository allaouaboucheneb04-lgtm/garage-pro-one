import Link from "next/link";
import { readPromos } from "@/lib/storage";
import { PromoCard } from "@/components/promo-card";
import { Section } from "@/components/section";

export default async function HomePage() {
  const promos = (await readPromos()).slice(0, 6);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-white/15 bg-white/5">
              <span className="text-champagne font-semibold">Bureau Mascouche</span>
              <span className="text-smoke">•</span>
              <span className="text-smoke">Départ Montréal</span>
            </div>

            <h1 className="mt-5 text-4xl md:text-6xl font-semibold leading-tight">
              Voyages d’exception.<br />Offres exclusives.
            </h1>
            <p className="mt-5 text-sm md:text-lg text-smoke">
              Promotions premium, service humain, et accompagnement complet — avant, pendant et après votre voyage.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/promotions" className="px-5 py-3 rounded-md bg-champagne text-ink font-semibold text-center hover:opacity-90">
                Voir les promotions
              </Link>
              <Link href="/sur-mesure" className="px-5 py-3 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 text-center">
                Créer un voyage sur mesure
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-champagne font-semibold">Paiement sécurisé</div>
                <div className="text-smoke mt-1">Acompte ou paiement complet.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-champagne font-semibold">Support 7j/7</div>
                <div className="text-smoke mt-1">Assistance rapide.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-champagne font-semibold">Sélection premium</div>
                <div className="text-smoke mt-1">Offres triées sur le volet.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section
        title="Offres Signature"
        subtitle="Une sélection d’offres premium, mises à jour depuis l’application admin — sans toucher au code."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {promos.map((p) => <PromoCard key={p.id} promo={p} />)}
        </div>

        <div className="mt-10 flex justify-center">
          <Link href="/promotions" className="px-5 py-3 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5">
            Voir toutes les promotions
          </Link>
        </div>
      </Section>

      <Section title="Voyage sur mesure" subtitle="Dites-nous votre style, votre budget et vos dates. On s’occupe du reste.">
        <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6 md:p-8">
          <form action="/api/leads" method="post" className="grid md:grid-cols-2 gap-4">
            <input type="hidden" name="kind" value="devis" />
            <div>
              <label className="text-sm text-smoke">Nom complet</label>
              <input name="fullName" required className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
            </div>
            <div>
              <label className="text-sm text-smoke">Téléphone</label>
              <input name="phone" required className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
            </div>
            <div>
              <label className="text-sm text-smoke">Email</label>
              <input name="email" type="email" required className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
            </div>
            <div>
              <label className="text-sm text-smoke">Dates souhaitées</label>
              <input name="preferredDates" placeholder="Ex: 10–17 avril" className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-smoke">Message</label>
              <textarea name="message" rows={4} className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
            </div>
            <button className="md:col-span-2 px-5 py-3 rounded-md bg-champagne text-ink font-semibold hover:opacity-90">
              Envoyer la demande
            </button>
            <p className="md:col-span-2 text-xs text-smoke">
              En local, les demandes sont enregistrées dans <code className="text-bone">src/data/leads.json</code>.
            </p>
          </form>
        </div>
      </Section>
    </div>
  );
}
