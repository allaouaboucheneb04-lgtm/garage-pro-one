# Maître du Voyage — Luxe Premium (Démo)

Projet Next.js (App Router) + Tailwind — site public + application Admin (dans /admin) pour gérer les promotions **sans toucher au code**.

## Pré-requis
- Node.js 18+ (idéalement 20)

## Installation
```bash
npm install
npm run dev
```

Ouvre: http://localhost:3000

## Accès
- Site public: `/` et `/promotions`
- Admin promos: `/admin`
- Demandes (devis/réservation démo): `/admin/leads`

## Stockage (démo locale)
- Promos: `src/data/promos.json`
- Leads: `src/data/leads.json` (créé automatiquement)

> Important: en production (hébergement serverless), l'écriture fichier n'est pas idéale.
> On branchera Supabase (DB) + Auth + Storage, et Stripe pour les paiements.

## Roadmap production (si tu veux)
- Auth admin (login + rôles)
- DB Supabase + stockage images
- Paiements Stripe (acompte / complet)
- SEO + pages destinations détaillées
- Import CSV promos + gestion vedettes + expiration automatique
