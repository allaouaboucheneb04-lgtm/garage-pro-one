import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink/35">
      <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-8">
        <div>
          <div className="text-bone font-semibold">Maître du Voyage</div>
          <p className="text-sm text-smoke mt-2">
            Promotions premium & voyages sur mesure. Bureau à Mascouche — départ Montréal.
          </p>
        </div>

        <div>
          <div className="text-sm font-semibold text-bone">Navigation</div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link className="text-bone/80 hover:text-bone" href="/promotions">Promotions</Link>
            <Link className="text-bone/80 hover:text-bone" href="/sur-mesure">Sur mesure</Link>
            <Link className="text-bone/80 hover:text-bone" href="/contact">Contact</Link>
            <Link className="text-bone/80 hover:text-bone" href="/admin">Admin promos</Link>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-bone">Contact</div>
          <div className="mt-3 text-sm text-smoke space-y-2">
            <div>Mascouche, QC</div>
            <div>Tél: (à ajouter)</div>
            <div>Email: (à ajouter)</div>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-bone">Offres privées</div>
          <form className="mt-3 flex gap-2" action="/api/newsletter" method="post">
            <input
              name="email"
              type="email"
              required
              placeholder="Votre email"
              className="flex-1 px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60"
            />
            <button className="px-4 py-2 rounded-md bg-champagne text-ink font-semibold hover:opacity-90">
              OK
            </button>
          </form>
          <p className="text-xs text-smoke mt-2">Pas de spam. Désinscription en 1 clic.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-8 text-xs text-smoke flex flex-col md:flex-row gap-2 md:justify-between">
        <div>© {new Date().getFullYear()} Maître du Voyage. Tous droits réservés.</div>
        <div className="flex gap-4">
          <Link className="hover:text-bone" href="/legal">Mentions</Link>
          <Link className="hover:text-bone" href="/privacy">Confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
