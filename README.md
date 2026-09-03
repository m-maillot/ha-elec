# ha-elec

Comparateur des trois options du **Tarif Bleu EDF** (Base, Heures Pleines / Heures Creuses, Tempo)
à partir de la consommation électrique horaire collectée par **Home Assistant**.

Application autonome (conteneur Docker) destinée à un usage sur réseau local.
La référence fonctionnelle et technique est [`docs/SPEC.md`](docs/SPEC.md).

> ⚠️ **Aucune authentification en V1.** Ne pas exposer l'application sur Internet sans reverse
> proxy authentifiant.

## Prérequis

- Home Assistant avec une entité d'énergie en kWh de `state_class: total_increasing`
  (celle du tableau de bord Énergie convient) et un jeton d'accès longue durée.
- Pour les couleurs Tempo : des identifiants API RTE « Tempo Like Supply Contract »
  (repli possible sur une entité HA ou un fichier CSV).

## Développement

Node 22+ et pnpm 10 (via `corepack enable`).

```bash
pnpm install
pnpm build        # première compilation de packages/core
pnpm dev          # API sur http://localhost:3000, front sur http://localhost:5173
pnpm test         # Vitest (core, api)
pnpm lint         # ESLint + Prettier
pnpm typecheck
```

Structure du monorepo :

| Dossier         | Rôle                                                            |
| --------------- | --------------------------------------------------------------- |
| `packages/core` | moteur de calcul pur, sans I/O (grilles, HP/HC, Tempo, lissage) |
| `apps/api`      | backend Node 22 + Fastify, SQLite, client Home Assistant        |
| `apps/web`      | front React + Vite, TanStack Query, Zustand, Tailwind, ECharts  |

## Déploiement Docker

```bash
cp .env.example .env      # renseigner APP_SECRET (ex. openssl rand -base64 32)
docker compose up -d
```

L'application répond sur `http://<hôte>:3000` ; état du serveur sur `/api/health`.
Les données (SQLite) sont conservées dans le volume `/data`.

Variables d'environnement : `APP_SECRET` (obligatoire), `PORT`, `TZ` (défaut `Europe/Paris`).

## Licence

MIT
