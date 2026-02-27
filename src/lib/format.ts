export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "2-digit" });
}
