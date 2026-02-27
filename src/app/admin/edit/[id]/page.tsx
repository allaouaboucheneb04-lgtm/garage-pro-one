import { readPromos } from "@/lib/storage";
import { PromoForm } from "@/components/promo-form";
import Link from "next/link";

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  const promos = await readPromos();
  const promo = promos.find(p => p.id === params.id);

  if (!promo) {
    return (
      <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
        <div className="text-sm text-smoke">Promo introuvable.</div>
        <Link href="/admin" className="text-champagne mt-3 inline-block">Retour</Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
      <div className="mb-5">
        <div className="text-sm text-smoke">Modifier</div>
        <h2 className="text-lg font-semibold">{promo.title}</h2>
      </div>
      <PromoForm mode="edit" initial={promo} />
    </div>
  );
}
