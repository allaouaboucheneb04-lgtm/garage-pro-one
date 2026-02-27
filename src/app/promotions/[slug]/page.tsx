import Image from "next/image";
import Link from "next/link";
import { readPromos } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/format";

export default async function PromoDetails({ params }: { params: { slug: string } }) {
  const promos = await readPromos();
  const promo = promos.find(p => p.slug === params.slug);

  if (!promo) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-semibold">Offre introuvable</h1>
        <Link href="/promotions" className="mt-4 inline-block text-champagne">Retour aux promotions</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-onyx/60">
          <div className="relative h-72 md:h-[420px]">
            <Image src={promo.image} alt={promo.title} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
          </div>
          <div className="p-6">
            <div className="text-sm text-smoke">{promo.destination} • {promo.type}</div>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold">{promo.title}</h1>

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-smoke">Prix à partir de</div>
                <div className="text-xl font-semibold text-champagne">{formatMoney(promo.priceFrom, promo.currency)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-smoke">Durée</div>
                <div className="text-xl font-semibold">{promo.durationNights} nuits</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-sm font-semibold text-bone">Inclus</div>
              <ul className="mt-2 grid sm:grid-cols-2 gap-2 text-sm text-smoke list-disc pl-5">
                {promo.includes.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>

            <div className="mt-6">
              <div className="text-sm font-semibold text-bone">Points forts</div>
              <ul className="mt-2 grid sm:grid-cols-2 gap-2 text-sm text-smoke list-disc pl-5">
                {promo.highlights.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
            <div className="text-sm text-smoke">Départ</div>
            <div className="text-lg font-semibold">{promo.departureCity}</div>

            <div className="mt-4 text-sm text-smoke">Dates disponibles</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {promo.startDates.map((d) => (
                <span key={d} className="text-xs px-3 py-1 rounded-full border border-white/15 bg-white/5">
                  {formatDate(d)}
                </span>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <a href="#reserver" className="flex-1 text-center px-4 py-3 rounded-md bg-champagne text-ink font-semibold hover:opacity-90">
                Réserver maintenant
              </a>
              <a href="#devis" className="flex-1 text-center px-4 py-3 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5">
                Demander un devis
              </a>
            </div>
          </div>

          <div id="reserver" className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
            <h2 className="text-lg font-semibold">Réservation en ligne (démo)</h2>
            <p className="text-sm text-smoke mt-2">
              Pour le test local, on simule une réservation via un formulaire. En production, on branchera Stripe (acompte ou paiement complet).
            </p>

            <form className="mt-5 grid sm:grid-cols-2 gap-4" action="/api/leads" method="post">
              <input type="hidden" name="kind" value="reservation" />
              <input type="hidden" name="promoId" value={promo.id} />
              <div className="sm:col-span-2">
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
                <label className="text-sm text-smoke">Adultes</label>
                <input name="adults" type="number" min="1" defaultValue="2" className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
              </div>
              <div>
                <label className="text-sm text-smoke">Enfants</label>
                <input name="children" type="number" min="0" defaultValue="0" className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
              </div>
              <div className="sm:col-span-2">
                <button className="w-full px-5 py-3 rounded-md bg-champagne text-ink font-semibold hover:opacity-90">
                  Confirmer (démo)
                </button>
              </div>
              <p className="sm:col-span-2 text-xs text-smoke">
                La demande est enregistrée dans <code className="text-bone">src/data/leads.json</code>.
              </p>
            </form>
          </div>

          <div id="devis" className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
            <h2 className="text-lg font-semibold">Demander un devis</h2>
            <form className="mt-5 grid sm:grid-cols-2 gap-4" action="/api/leads" method="post">
              <input type="hidden" name="kind" value="devis" />
              <input type="hidden" name="promoId" value={promo.id} />
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
                <label className="text-sm text-smoke">Message</label>
                <textarea name="message" rows={4} className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60" />
              </div>
              <div className="sm:col-span-2">
                <button className="w-full px-5 py-3 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 font-semibold">
                  Envoyer
                </button>
              </div>
            </form>
          </div>

          <div className="text-sm text-smoke">
            <Link href="/promotions" className="text-champagne hover:opacity-90">← Retour aux promotions</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
