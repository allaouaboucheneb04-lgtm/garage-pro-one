import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="text-xs text-smoke">Application interne</div>
          <h1 className="text-2xl font-semibold">Admin — Promotions</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="px-4 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 text-sm">Promos</Link>
          <Link href="/admin/leads" className="px-4 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 text-sm">Demandes</Link>
          <Link href="/admin/new" className="px-4 py-2 rounded-md bg-champagne text-ink font-semibold text-sm hover:opacity-90">Créer une promo</Link>
        </div>
      </div>
      {children}
      <div className="mt-10 text-xs text-smoke">
        ⚠️ Démo locale: pas d’authentification. En production on ajoute login + rôles.
      </div>
    </div>
  );
}
