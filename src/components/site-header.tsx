import Link from "next/link";
import { Brand } from "./brand";

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link
    href={href}
    className="text-sm text-bone/80 hover:text-bone transition px-3 py-2 rounded-md hover:bg-white/5"
  >
    {children}
  </Link>
);

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-ink/55 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="hover:opacity-95">
          <Brand />
        </Link>

        <nav className="hidden md:flex items-center">
          <NavLink href="/promotions">Promotions</NavLink>
          <NavLink href="/destinations">Destinations</NavLink>
          <NavLink href="/croisieres">Croisières</NavLink>
          <NavLink href="/sur-mesure">Sur mesure</NavLink>
          <NavLink href="/contact">Contact</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://wa.me/"
            className="hidden sm:inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-white/15 hover:border-white/25 hover:bg-white/5 transition"
          >
            WhatsApp
          </a>
          <Link
            href="/promotions"
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-champagne text-ink font-semibold hover:opacity-90 transition"
          >
            Réserver / Devis
          </Link>
        </div>
      </div>
    </header>
  );
}
