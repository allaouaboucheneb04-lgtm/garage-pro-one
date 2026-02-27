import { NextResponse } from "next/server";
import { addLead } from "@/lib/storage";
import { Lead } from "@/lib/types";

export async function POST(req: Request) {
  const form = await req.formData();

  const lead: Lead = {
    id: "l" + Math.random().toString(16).slice(2, 10),
    createdAt: new Date().toISOString(),
    kind: (String(form.get("kind") ?? "devis") as Lead["kind"]),
    promoId: (form.get("promoId") ? String(form.get("promoId")) : undefined),
    fullName: String(form.get("fullName") ?? ""),
    phone: String(form.get("phone") ?? ""),
    email: String(form.get("email") ?? ""),
    adults: Number(form.get("adults") ?? 2),
    children: Number(form.get("children") ?? 0),
    message: (form.get("message") ? String(form.get("message")) : undefined),
    preferredDates: (form.get("preferredDates") ? String(form.get("preferredDates")) : undefined),
  };

  if (!lead.fullName || !lead.phone || !lead.email) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }

  await addLead(lead);
  return NextResponse.redirect(new URL("/admin/leads", req.url));
}
