import Link from "next/link";
import { readPromos } from "@/lib/storage";
import { formatMoney } from "@/lib/format";

export default async function AdminPromosPage() {
  const promos = await readPromos();
  return (
    <div className="rounded-2xl border border-white/10 bg-onyx/60 overflow-hidden">
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm font-semibold">Promotions</div>
        <Link href="/admin/new" className="text-sm text-champagne hover:opacity-90">+ Nouvelle promo</Link>
      </div>

      <div className="divide-y divide-white/10">
        {promos.map((p) => (
          <div key={p.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
            <div>
              <div className="text-sm text-smoke">{p.destination} • {p.type}</div>
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-smoke mt-1">Slug: {p.slug}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-champagne font-semibold">{formatMoney(p.priceFrom, p.currency)}</div>
              <Link className="px-4 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 text-sm" href={`/promotions/${p.slug}`} target="_blank">
                Voir
              </Link>
              <Link className="px-4 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 text-sm" href={`/admin/edit/${p.id}`}>
                Modifier
              </Link>
              <form action="/api/promos/delete" method="post">
                <input type="hidden" name="id" value={p.id} />
                <button className="px-4 py-2 rounded-md bg-white/5 border border-red-400/30 hover:border-red-400/50 text-sm">
                  Supprimer
                </button>
              </form>
            </div>
          </div>
        ))}
        {promos.length === 0 ? (
          <div className="p-6 text-sm text-smoke">Aucune promo. Clique sur “Créer une promo”.</div>
        ) : null}
      </div>
    </div>
  );
}
