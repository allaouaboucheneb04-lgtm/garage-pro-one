export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-full border border-champagne/60 bg-onyx shadow-soft grid place-items-center">
        <span className="text-champagne font-semibold">M</span>
      </div>
      <div className="leading-tight">
        <div className="text-bone font-semibold tracking-wide">Maître du Voyage</div>
        <div className="text-xs text-smoke">Luxe Premium — Mascouche</div>
      </div>
    </div>
  );
}
