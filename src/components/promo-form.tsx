"use client";

import { useMemo, useState } from "react";

type PromoFormProps = {
  initial?: any;
  mode: "create" | "edit";
};

export function PromoForm({ initial, mode }: PromoFormProps) {
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(() => ({
    id: initial?.id ?? "",
    title: initial?.title ?? "",
    destination: initial?.destination ?? "",
    departureCity: initial?.departureCity ?? "Montréal",
    durationNights: initial?.durationNights ?? 7,
    priceFrom: initial?.priceFrom ?? 1999,
    currency: initial?.currency ?? "CAD",
    type: initial?.type ?? "Tout inclus",
    startDates: (initial?.startDates ?? ["2026-03-15"]).join(", "),
    includes: (initial?.includes ?? ["Vol aller-retour", "Hôtel", "Transferts"]).join(", "),
    highlights: (initial?.highlights ?? ["Service premium"]).join(", "),
    image: initial?.image ?? "/images/hero-1.jpg"
  }), [initial]);

  const action = mode === "create" ? "/api/promos/create" : "/api/promos/update";

  return (
    <form
      action={action}
      method="post"
      onSubmit={() => setSaving(true)}
      className="grid md:grid-cols-2 gap-4"
    >
      {mode === "edit" ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <Field label="Titre" name="title" defaultValue={defaults.title} required />
      <Field label="Destination" name="destination" defaultValue={defaults.destination} required />

      <Field label="Ville de départ" name="departureCity" defaultValue={defaults.departureCity} required />
      <Field label="Type" name="type" defaultValue={defaults.type} required placeholder="Tout inclus / Séjour / Circuit / Croisière / Vol" />

      <Field label="Durée (nuits)" name="durationNights" type="number" defaultValue={defaults.durationNights} required />
      <Field label="Prix à partir de" name="priceFrom" type="number" defaultValue={defaults.priceFrom} required />

      <Field label="Devise" name="currency" defaultValue={defaults.currency} required placeholder="CAD" />
      <Field label="Image (chemin public)" name="image" defaultValue={defaults.image} required placeholder="/images/hero-1.jpg" />

      <div className="md:col-span-2">
        <label className="text-sm text-smoke">Dates (YYYY-MM-DD, séparées par virgule)</label>
        <input
          name="startDates"
          defaultValue={defaults.startDates}
          className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60"
          required
        />
      </div>

      <div className="md:col-span-2">
        <label className="text-sm text-smoke">Inclus (séparés par virgule)</label>
        <input
          name="includes"
          defaultValue={defaults.includes}
          className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60"
          required
        />
      </div>

      <div className="md:col-span-2">
        <label className="text-sm text-smoke">Points forts (séparés par virgule)</label>
        <input
          name="highlights"
          defaultValue={defaults.highlights}
          className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60"
          required
        />
      </div>

      <button
        disabled={saving}
        className="md:col-span-2 px-5 py-3 rounded-md bg-champagne text-ink font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Enregistrement..." : mode === "create" ? "Créer la promo" : "Enregistrer les changements"}
      </button>
    </form>
  );
}

function Field(props: any) {
  const { label, ...rest } = props;
  return (
    <div>
      <label className="text-sm text-smoke">{label}</label>
      <input
        {...rest}
        className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-champagne/60"
      />
    </div>
  );
}
