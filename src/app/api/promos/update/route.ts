import { NextResponse } from "next/server";
import { readPromos, writePromos } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { Promo } from "@/lib/types";

export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID manquant." }, { status: 400 });

  const promos = await readPromos();
  const idx = promos.findIndex(p => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Promo introuvable." }, { status: 404 });

  const title = String(form.get("title") ?? "").trim();
  const destination = String(form.get("destination") ?? "").trim();
  const departureCity = String(form.get("departureCity") ?? "").trim();
  const type = String(form.get("type") ?? "Tout inclus").trim() as Promo["type"];
  const durationNights = Number(form.get("durationNights") ?? 7);
  const priceFrom = Number(form.get("priceFrom") ?? 0);
  const currency = String(form.get("currency") ?? "CAD").trim() as Promo["currency"];
  const image = String(form.get("image") ?? "/images/hero-1.jpg").trim();

  const startDates = String(form.get("startDates") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const includes = String(form.get("includes") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const highlights = String(form.get("highlights") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const updated: Promo = {
    ...promos[idx],
    title,
    destination,
    departureCity,
    durationNights,
    priceFrom,
    currency,
    startDates,
    type,
    highlights,
    includes,
    image,
    slug: slugify(title)
  };

  promos[idx] = updated;
  await writePromos(promos);

  return NextResponse.redirect(new URL("/admin", req.url));
}
