import { readPromos } from "@/lib/storage";
import { PromoCard } from "@/components/promo-card";
import { Section } from "@/components/section";

export default async function PromotionsPage() {
  const promos = await readPromos();
  return (
    <div>
      <Section title="Promotions" subtitle="Offres premium, triées pour une expérience haut de gamme.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {promos.map((p) => <PromoCard key={p.id} promo={p} />)}
        </div>
      </Section>
    </div>
  );
}
