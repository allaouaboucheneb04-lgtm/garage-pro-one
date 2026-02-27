export type Promo = {
  id: string;
  title: string;
  destination: string;
  departureCity: string;
  durationNights: number;
  priceFrom: number;
  currency: "CAD" | "USD" | "EUR";
  startDates: string[]; // YYYY-MM-DD
  type: "Tout inclus" | "Séjour" | "Circuit" | "Croisière" | "Vol";
  highlights: string[];
  includes: string[];
  image: string; // public path
  slug: string;
};

export type Lead = {
  id: string;
  createdAt: string;
  kind: "devis" | "reservation";
  promoId?: string;
  fullName: string;
  phone: string;
  email: string;
  adults: number;
  children: number;
  message?: string;
  preferredDates?: string;
};
