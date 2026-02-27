export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="py-14">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-bone">{title}</h2>
          {subtitle ? <p className="text-sm md:text-base text-smoke mt-2 max-w-2xl">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
