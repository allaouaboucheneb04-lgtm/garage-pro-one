import Link from "next/link";
import Image from "next/image";
import { Promo } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export function PromoCard({ promo }: { promo: Promo }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-onyx/60 shadow-soft">
      <div className="relative h-44">
        <Image src={promo.image} alt={promo.title} fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
        <div className="absolute top-3 left-3">
          <span className="text-xs px-3 py-1 rounded-full bg-champagne text-ink font-semibold">
            Offre Signature
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="text-xs text-smoke">{promo.destination} • {promo.type}</div>
        <div className="mt-1 font-semibold text-bone">{promo.title}</div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-sm text-smoke">{promo.durationNights} nuits</div>
          <div className="text-lg font-semibold text-champagne">{formatMoney(promo.priceFrom, promo.currency)}</div>
        </div>

        <div className="mt-4 flex gap-2">
          <Link
            href={`/promotions/${promo.slug}`}
            className="flex-1 text-center px-4 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 transition text-sm"
          >
            Détails
          </Link>
          <Link
            href={`/promotions/${promo.slug}#reserver`}
            className="flex-1 text-center px-4 py-2 rounded-md bg-champagne text-ink font-semibold hover:opacity-90 transition text-sm"
          >
            Réserver
          </Link>
        </div>
      </div>
    </div>
  );
}
