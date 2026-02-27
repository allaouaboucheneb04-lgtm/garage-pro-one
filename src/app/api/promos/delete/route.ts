import { NextResponse } from "next/server";
import { readPromos, writePromos } from "@/lib/storage";

export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID manquant." }, { status: 400 });

  const promos = await readPromos();
  const next = promos.filter(p => p.id !== id);
  await writePromos(next);

  return NextResponse.redirect(new URL("/admin", req.url));
}
