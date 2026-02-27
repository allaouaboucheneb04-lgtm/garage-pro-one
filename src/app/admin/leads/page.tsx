import { readLeads, readPromos } from "@/lib/storage";
import { formatDate } from "@/lib/format";

export default async function LeadsPage() {
  const leads = await readLeads();
  const promos = await readPromos();
  const promoMap = new Map(promos.map(p => [p.id, p.title]));

  return (
    <div className="rounded-2xl border border-white/10 bg-onyx/60 overflow-hidden">
      <div className="p-5 border-b border-white/10">
        <div className="text-sm font-semibold">Demandes (devis / réservations)</div>
        <div className="text-xs text-smoke mt-1">Stockées localement dans src/data/leads.json</div>
      </div>

      <div className="divide-y divide-white/10">
        {leads.map((l) => (
          <div key={l.id} className="p-5">
            <div className="flex flex-col md:flex-row md:justify-between gap-2">
              <div>
                <div className="text-xs text-smoke">{formatDate(l.createdAt.slice(0,10))} • <span className="text-champagne font-semibold">{l.kind.toUpperCase()}</span></div>
                <div className="font-semibold">{l.fullName} — {l.phone}</div>
                <div className="text-sm text-smoke">{l.email}</div>
              </div>
              <div className="text-sm text-smoke">
                {l.promoId ? <div><span className="text-bone">Promo:</span> {promoMap.get(l.promoId) ?? l.promoId}</div> : null}
                <div><span className="text-bone">Adultes:</span> {l.adults} • <span className="text-bone">Enfants:</span> {l.children}</div>
              </div>
            </div>
            {l.message ? <div className="mt-3 text-sm text-smoke border-l border-champagne/40 pl-4">{l.message}</div> : null}
          </div>
        ))}
        {leads.length === 0 ? <div className="p-6 text-sm text-smoke">Aucune demande pour l’instant.</div> : null}
      </div>
    </div>
  );
}
