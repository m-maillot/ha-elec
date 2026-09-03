# ha-elec – Comparateur de tarifs EDF depuis Home Assistant

Interface web autonome qui récupère la consommation électrique horaire collectée par Home Assistant
et simule le coût sur une période pour les trois options du Tarif Bleu EDF : **Base**, **HP/HC** et **Tempo**.

La référence fonctionnelle et technique est **`docs/SPEC.md`** (v0.2, validée). Toujours la lire avant
d'implémenter une règle métier ; les sections sont référencées « §x » dans les issues GitHub.
Le découpage en lots est porté par les issues GitHub (jalon **V1**, tableau « ha-elec – V1 » : https://github.com/users/m-maillot/projects/1).

## Stack

- Monorepo **pnpm**, **TypeScript strict** partout.
  - `packages/core` : moteur de calcul **pur, sans I/O** (grilles, HP/HC, Tempo, lissage). Testé avec Vitest.
  - `apps/api` : **Node 22 + Fastify**, SQLite via `better-sqlite3` + `drizzle-orm`, client HA `home-assistant-js-websocket` (+ `ws`).
  - `apps/web` : **React 18 + Vite**, TanStack Query, Zustand, Tailwind + shadcn/ui, graphiques **ECharts**.
- Tests : Vitest (core, api), Playwright (parcours).
- Déploiement : image Docker multi-stage unique, `docker compose up`, volume `/data`, variables `APP_SECRET`, `PORT`, `TZ=Europe/Paris`.
- Pas d'add-on HA, pas d'authentification applicative (usage LAN) en V1.

## Commandes

```bash
pnpm install
pnpm dev          # api + web
pnpm test         # vitest
pnpm lint
docker compose up
```

## Règles métier à ne pas trahir (détail dans docs/SPEC.md §5)

- Données HA : `recorder/statistics_during_period`, `period: "hour"`, `types: ["sum","change"]`, tranches de 31 jours. Maille minimale = **l'heure**. Buckets UTC → convertir en `Europe/Paris`.
- Créneaux HC au pas de **30 min**, affectation HP/HC **au prorata sur l'heure** (`partHC ∈ {0, 0.5, 1}`). Deux jeux de créneaux indépendants : HP/HC et Tempo.
- Couleur Tempo appliquée sur la fenêtre **06:00 → 06:00 J+1** (paramètre `color_switch_hour`, défaut 6).
- Abonnement au prorata : `annuel × nbJours / 365`.
- **Une seule grille tarifaire** sur toute la période (pas de gestion des révisions). Puissance souscrite = simple clé de saisie.
- **Lissage jours rouges** (Tempo uniquement, désactivé par défaut) : regrouper les jours rouges consécutifs en période rouge ; références = 3 jours non rouges avant + 3 après (fenêtre 14 j) ; profil = moyenne **heure par heure** ; un jour rouge n'est jamais une référence.
- Jours sans couleur Tempo ou heures sans données : exclus et **signalés**, jamais comptés à zéro silencieusement.
- Calculs en centimes, arrondi uniquement à l'affichage ; kWh à 3 décimales.
- Source des couleurs Tempo par défaut : **API RTE « Tempo Like Supply Contract »** (OAuth2 client credentials) ; repli : entité HA, CSV.
- Secrets (token HA, secret RTE) chiffrés AES-256-GCM au repos, **jamais renvoyés au navigateur**.

## Conventions

- Une branche par lot (`lot-0`, `lot-1`, …), une PR par issue, CI verte avant merge.
- Toute règle de calcul ajoutée dans `packages/core` est accompagnée de tests ; les exemples chiffrés de `docs/SPEC.md` §5.6 sont des cas de test obligatoires.
- Interface en français ; chaînes externalisées.
- Ne pas exposer de proxy générique vers HA : uniquement les routes listées en §6.6.
