import { PromoForm } from "@/components/promo-form";

export default function NewPromoPage() {
  return (
    <div className="rounded-2xl border border-white/10 bg-onyx/60 p-6">
      <div className="mb-5">
        <div className="text-sm text-smoke">Créer une nouvelle promo</div>
        <h2 className="text-lg font-semibold">Nouvelle promotion</h2>
      </div>
      <PromoForm mode="create" />
    </div>
  );
}
