# Spécification – Comparateur de tarifs EDF depuis Home Assistant

| | |
|---|---|
| **Projet** | Comparateur d'options tarifaires EDF (Base / HP-HC / Tempo) |
| **Version** | 0.2 – arbitrages intégrés |
| **Date** | 3 septembre 2026 |
| **Auteur** | Martial |
| **Statut** | Validée pour démarrage |

**Historique**

| Version | Date | Changements |
|---|---|---|
| 0.1 | 03/09/2026 | Première version pour cadrage |
| 0.2 | 03/09/2026 | Arbitrages des questions ouvertes : lissage sur 3 jours non rouges de part et d'autre de la période rouge, API RTE par défaut, grille unique, standalone sans authentification |

---

## 1. Contexte et objectif

Home Assistant (HA) collecte en continu la consommation électrique du logement (compteur Linky via TIC, module Enedis, pince ampèremétrique, etc.) et la conserve sous forme de statistiques long terme. Aujourd'hui rien ne permet d'exploiter simplement cet historique pour répondre à la question : **« quelle option du Tarif Bleu EDF me coûterait le moins cher, compte tenu de ma consommation réelle ? »**

Le projet consiste à développer une **interface web autonome** qui :

1. récupère la consommation collectée par HA sur une période choisie ;
2. simule le coût de cette consommation pour chacune des trois options du Tarif Bleu : **Base**, **Heures Pleines / Heures Creuses (HP/HC)** et **Tempo** ;
3. présente les résultats côte à côte, avec le détail des répartitions (HP/HC, couleurs Tempo) ;
4. permet, pour Tempo, de « lisser » la consommation des jours rouges afin de simuler un comportement sans effacement.

Les tarifs et créneaux horaires sont **entièrement paramétrables** par l'utilisateur, l'application ne dépend donc pas d'une grille tarifaire figée.

## 2. Périmètre

### 2.1 Inclus (V1)

- Connexion à une instance HA (URL + token longue durée) et sélection de l'entité de consommation.
- Chargement de la consommation horaire sur une période (date de début / date de fin).
- Récupération de l'historique des couleurs Tempo pour la période (source configurable, voir §6.4).
- Écran de configuration : tarifs des trois options, puissance souscrite, créneaux HC (HP/HC et Tempo), source des couleurs Tempo.
- Écran principal : sélection de la période, indication de l'option actuelle, graphique de consommation avec zoom jusqu'à l'heure, tableau comparatif des coûts, répartitions détaillées.
- Option de lissage Tempo (jours rouges).
- Persistance locale de la configuration et du cache de données.

### 2.2 Exclus (V1) – candidats V2

- Simulation d'autres fournisseurs / offres de marché (multi-grilles).
- Import direct depuis Enedis (API Data Connect) sans HA.
- Prise en compte de la production solaire / autoconsommation.
- Historique multi-années avec évolution des tarifs dans le temps (une seule grille appliquée à toute la période en V1).
- Multi-utilisateurs, authentification de l'application elle-même (usage réseau local).
- Notifications / alertes.

## 3. Utilisateurs et cas d'usage

Utilisateur unique : le propriétaire de l'instance HA, à l'aise avec l'outil (sait créer un token, connaît le nom de ses entités).

| # | Cas d'usage | Résultat attendu |
|---|---|---|
| CU1 | Je suis en HP/HC, je veux savoir si Tempo me ferait économiser sur les 12 derniers mois | Trois totaux comparés, écart en € et % par rapport à mon option actuelle |
| CU2 | Je veux voir combien m'ont coûté les jours rouges cet hiver | Répartition Tempo par couleur × HP/HC, en kWh et en € |
| CU3 | Je veux savoir ce que Tempo coûterait si je ne faisais **aucun** effort les jours rouges | Activation du lissage → recalcul du coût Tempo |
| CU4 | Mes tarifs ont changé au 1er août, je les mets à jour | Nouvelle grille saisie, recalcul immédiat |
| CU5 | Je change de créneaux HC (nouvelles HC Enedis en journée) | Créneaux mis à jour, recalcul immédiat |
| CU6 | Je veux vérifier un pic de conso un jour donné | Zoom sur le graphique jusqu'à la maille horaire |

## 4. Exigences fonctionnelles

### 4.1 Écran de configuration

#### 4.1.1 Connexion Home Assistant

| Champ | Type | Règles |
|---|---|---|
| URL de l'instance | texte | ex. `http://homeassistant.local:8123` ; test de connexion obligatoire |
| Token longue durée | secret | créé dans le profil HA ; stocké chiffré/obfusqué côté serveur, jamais renvoyé au navigateur |
| Entité de consommation | liste déroulante | filtrée sur les entités ayant des statistiques long terme avec `unit_of_measurement` en kWh/Wh et `state_class` `total` / `total_increasing` |
| Entité couleur Tempo (optionnelle) | liste déroulante | sensor exposant la couleur du jour (ex. intégration *RTE Tempo*) ; utilisée comme source d'historique des couleurs si présente |

Un bouton **« Tester la connexion »** vérifie l'accès (`GET /api/`) et affiche la version HA et le nombre d'entités éligibles.

#### 4.1.2 Puissance souscrite

Sélecteur 3 / 6 / 9 / 12 / 15 / 18 kVA. La puissance n'est qu'une **clé de saisie** : l'abonnement annuel est saisi par option pour cette puissance (pas de grille embarquée).

#### 4.1.3 Grille tarifaire

Toutes les valeurs sont en **€ TTC**, saisies avec 4 décimales pour le kWh et 2 pour l'abonnement. Une grille est datée (champ « en vigueur depuis ») à titre informatif.

| Option | Champs |
|---|---|
| Base | prix kWh ; abonnement annuel |
| HP/HC | prix kWh HP ; prix kWh HC ; abonnement annuel |
| Tempo | prix kWh Bleu HC, Bleu HP, Blanc HC, Blanc HP, Rouge HC, Rouge HP ; abonnement annuel |

Un bouton **« Pré-remplir avec le Tarif Bleu au 01/08/2026 »** renseigne les valeurs par défaut ci-dessous (valeurs publiques, à titre indicatif, modifiables) :

| Option | 6 kVA | 9 kVA | 12 kVA |
|---|---|---|---|
| Base – abonnement | 190,32 € | 238,56 € | 285,12 € |
| Base – kWh | 0,2001 € | 0,1985 € | 0,1985 € |
| HP/HC – abonnement | 190,32 € | 238,56 € | 285,12 € |
| HP/HC – kWh HP / HC | 0,2142 € / 0,1589 € | idem | idem |
| Tempo – abonnement | 189,60 € | 236,40 € | 282,00 € |
| Tempo – Bleu HC / HP | 0,1356 € / 0,1654 € | idem | idem |
| Tempo – Blanc HC / HP | 0,1536 € / 0,1921 € | idem | idem |
| Tempo – Rouge HC / HP | 0,1615 € / 0,7295 € | idem | idem |

> Ces valeurs sont des constantes de l'application, à mettre à jour à chaque révision du tarif réglementé. Elles ne doivent en aucun cas être considérées comme une source de vérité : l'utilisateur reste responsable de sa grille.

#### 4.1.4 Créneaux heures creuses

Deux jeux de créneaux indépendants, car ils peuvent différer :

- **Créneaux HC option HP/HC** : liste de 1 à N plages `[début, fin[` en heure locale, au pas de **30 minutes** (ex. `22:30–06:30`, ou `02:00–07:00` + `12:00–14:00`). Les plages peuvent chevaucher minuit. Total conseillé : 8 h/jour (avertissement non bloquant si ≠ 8 h).
- **Créneaux HC option Tempo** : par défaut une plage unique `22:00–06:00` (créneau national Tempo), modifiable de la même façon.

Validation : pas de chevauchement entre plages d'un même jeu ; fin ≠ début.

#### 4.1.5 Source des couleurs Tempo

Source **par défaut et recommandée** : l'**API officielle RTE « Tempo Like Supply Contract »**. Saisie de `client_id` / `client_secret` (compte gratuit sur data.rte-france.com, abonnement à l'API puis création d'une application). Un bouton « Tester » vérifie l'obtention d'un jeton OAuth2 et récupère la couleur du jour.

Sources secondaires, disponibles en repli :

1. **Entité HA** (si l'intégration RTE Tempo est installée) : l'historique de l'état du sensor est lu dans le recorder HA ; limité à la date d'installation de l'intégration.
2. **Import manuel CSV** (`date;couleur`) : mode de secours.

L'API tierce sans authentification n'est pas retenue en V1.

L'application met en cache les couleurs par date (elles ne changent jamais une fois passées).

### 4.2 Écran principal

#### 4.2.1 Barre de paramètres

- **Période** : date de début et date de fin (incluses), présélections « 30 derniers jours », « 12 derniers mois », « saison Tempo en cours (1er sept. → 31 août) », « année civile précédente ».
- **Option actuelle** : Base / HP/HC / Tempo. Sert de référence pour afficher les écarts.
- **Lissage jours rouges** (interrupteur, actif uniquement pour la colonne Tempo, désactivé par défaut) : voir §5.5.
- Bouton **« Actualiser »** : recharge les données HA pour la période (le cache est utilisé pour les jours déjà connus).

#### 4.2.2 Graphique de consommation

- Courbe ou histogramme de la consommation (kWh) sur la période.
- Maille automatique selon la largeur de la période : **mois → jour → heure**. Zoom à la molette / sélection d'une plage ; double-clic pour revenir à la vue complète.
- **Maille minimale : l'heure** (voir §6.2 pour la justification côté HA).
- Coloration des barres selon le contexte :
  - en vue HP/HC : deux teintes HP / HC ;
  - en vue Tempo : bleu / blanc / rouge, avec hachures ou teinte plus claire pour les HC ;
  - en vue Base : teinte unique.
- Un sélecteur « Colorer selon : Base / HP-HC / Tempo » au-dessus du graphique.
- Survol : date/heure, kWh, couleur Tempo, HP ou HC, coût dans chaque option.
- Les heures sans donnée sont affichées comme manquantes (trou), pas comme zéro, et comptées dans un indicateur « X h manquantes sur la période ».

#### 4.2.3 Tableau comparatif des coûts

Trois cartes (ou colonnes) : **Base**, **HP/HC**, **Tempo**. Pour chacune :

| Ligne | Contenu |
|---|---|
| Total période | € TTC = consommation + abonnement au prorata |
| dont consommation | € |
| dont abonnement | € (abonnement annuel × nb jours / 365) |
| Écart vs option actuelle | ± € et ± % (masqué sur la carte de l'option actuelle, marquée « actuelle ») |
| Consommation totale | kWh (identique pour les trois) |
| Prix moyen | €/kWh (total consommation ÷ kWh) |

La carte la moins chère est mise en évidence (« meilleure option »).

**Détail HP/HC** (carte HP/HC) :

| | kWh | % | € |
|---|---|---|---|
| Heures pleines | | | |
| Heures creuses | | | |

**Détail Tempo** (carte Tempo) : tableau croisé couleur × HP/HC avec, pour chaque couleur, le **nombre de jours** de cette couleur dans la période.

| Couleur | Jours | kWh HP | kWh HC | € HP | € HC | € total |
|---|---|---|---|---|---|---|
| Bleu | | | | | | |
| Blanc | | | | | | |
| Rouge | | | | | | |

Lorsque le lissage est actif, la carte Tempo affiche en plus « Coût sans lissage : X € » et « kWh redistribués sur les jours rouges : Y kWh ».

#### 4.2.4 États et messages

- Aucune configuration → redirection vers l'écran de configuration avec message d'accueil.
- Chargement HA en cours → barre de progression par tranche de jours.
- Données partielles (jours manquants côté HA ou couleurs Tempo inconnues) → bandeau d'avertissement listant les jours concernés ; les jours sans couleur Tempo sont **exclus** du calcul Tempo et signalés (le total Tempo est alors marqué « partiel »).
- Erreur HA (401, réseau) → message explicite + lien vers la configuration.

## 5. Règles de calcul

Notation : la période est découpée en **créneaux horaires** `h` (heure locale `Europe/Paris`), chacun portant une consommation `E(h)` en kWh, un jour `d(h)`, et une couleur Tempo `c(d)` ∈ {bleu, blanc, rouge}.

### 5.1 Consommation par créneau

`E(h)` provient des statistiques HA (§6.2) : différence de l'index (`sum`) entre `h` et `h+1`, ou champ `change` s'il est disponible. Toute valeur négative (remise à zéro de compteur) est ramenée à 0 et signalée.

### 5.2 Affectation HP / HC

Un créneau horaire `h` = `[t, t+1h[` est comparé aux plages HC du jeu concerné (HP/HC ou Tempo). Comme les plages sont au pas de 30 min et les données au pas de 1 h, on **répartit au prorata** :

```
partHC(h) = durée(h ∩ plages HC) / 1h        ∈ {0, 0.5, 1}
E_HC(h)   = E(h) × partHC(h)
E_HP(h)   = E(h) − E_HC(h)
```

Hypothèse : consommation uniforme à l'intérieur de l'heure. Ce prorata est acceptable ; si on veut l'éviter, il faut des données 5 min (limitées à 10 jours dans HA par défaut, cf. §6.2).

Les plages qui chevauchent minuit sont traitées naturellement en travaillant sur des instants absolus. Les changements d'heure été/hiver : le créneau HA est UTC, converti en heure locale avant comparaison ; le jour de 23 h ou 25 h est géré sans cas particulier.

### 5.3 Abonnement au prorata

```
abo(option) = abonnementAnnuel(option) × nbJours(période) / 365
```

`nbJours` = nombre de jours civils inclus dans la période (bornes incluses). On ne tient pas compte des années bissextiles (simplification acceptée).

### 5.4 Coût des trois options

```
Base   = Σ E(h) × prixBase                              + abo(Base)
HPHC   = Σ [ E_HP(h) × prixHP + E_HC(h) × prixHC ]       + abo(HPHC)
Tempo  = Σ [ E_HP(h) × prixHP[c(d(h))] + E_HC(h) × prixHC[c(d(h))] ] + abo(Tempo)
```

**Jour Tempo** : la couleur Tempo s'applique de **06:00 à 06:00 le lendemain** (le jour rouge commence à 6 h et ses HC de 22 h à 6 h sont facturées au tarif rouge HC). Donc `c(h)` = couleur du jour `d` tel que `h ∈ [d 06:00, d+1 06:00[`. Cette règle est indépendante des créneaux HC saisis (si l'utilisateur modifie les HC Tempo, la frontière de couleur reste 6 h ; paramètre avancé « heure de bascule de couleur », défaut 06:00).

Écarts : `écart(option) = coût(option) − coût(optionActuelle)`.

### 5.5 Lissage des jours rouges (Tempo)

**Problème** : un foyer déjà en Tempo réduit fortement sa consommation les jours rouges (chauffage coupé, report des usages). Son historique sous-estime donc ce que coûterait Tempo « sans effort », et inversement un foyer en Base ne voit pas l'intérêt de l'effacement. Le lissage permet de simuler une consommation « normale » les jours rouges.

**Algorithme** (appliqué uniquement au calcul Tempo, jamais aux autres options ni au graphique par défaut) :

Les jours rouges sont d'abord regroupés en **périodes rouges** = suites de jours rouges consécutifs (un jour rouge isolé est une période de longueur 1). Les jours rouges ne peuvent jamais servir de référence.

Pour chaque période rouge `[R1 … Rk]` :

1. Chercher les **3 jours non-rouges** les plus proches **avant** `R1` et les **3 jours non-rouges** les plus proches **après** `Rk`. On saute les jours rouges (y compris ceux d'une autre période rouge voisine) et les jours sans données. Fenêtre de recherche maximale : 14 jours de chaque côté (paramètre avancé `smoothingSearchWindowDays`).
2. Construire un profil horaire de substitution unique pour la période, moyenne **heure par heure** des jours de référence trouvés (jusqu'à 6) :
   `E'(hh) = moyenne( E(J, hh) pour J ∈ références )` pour chaque heure `hh` de 0 à 23 (heure locale). La moyenne heure par heure conserve le profil HP/HC.
3. Cas dégradés : si moins de 3 jours sont trouvés d'un côté (début/fin de période analysée), on utilise ce qui est disponible ; si aucun jour de référence n'existe des deux côtés, la période rouge est laissée telle quelle et signalée dans le bandeau d'avertissement.
4. Appliquer `E'(hh)` à chaque jour `Ri` de la période rouge, sur sa fenêtre de couleur (06:00 → 06:00 J+1), puis appliquer §5.4.

Paramètres avancés (écran de configuration, valeurs par défaut suffisantes) : nombre de jours de référence de chaque côté `N = 3` ; fenêtre de recherche `14` jours. Les week-ends ne sont pas exclus des références (les jours rouges sont toujours des jours de semaine, la moyenne sur 3 jours atténue l'effet d'un éventuel week-end).

Le graphique propose une case « Afficher la conso lissée » qui superpose en pointillés la courbe modifiée sur les jours rouges, pour rendre l'hypothèse visible.

### 5.6 Exemple numérique de contrôle

Journée rouge du 15/01, consommation 10 kWh dont 6 kWh en HC (22 h–6 h) et 4 kWh en HP. Tarifs Tempo par défaut :

```
Rouge  = 4 × 0,7295 + 6 × 0,1615 = 2,918 + 0,969 = 3,887 €
Base   = 10 × 0,2001              = 2,001 €
HP/HC  = 4 × 0,2142 + 6 × 0,1589  = 0,8568 + 0,9534 = 1,810 €
```

Avec lissage, si les 3 jours non rouges précédents (12, 13, 14/01) et les 3 suivants (16, 17, 18/01) ont consommé respectivement 30, 32, 28 et 34, 36, 32 kWh avec la même répartition 40 % HP / 60 % HC : `E' = 192 / 6 = 32 kWh` → `12,8 × 0,7295 + 19,2 × 0,1615 = 9,338 + 3,101 = 12,438 €`. Ces valeurs servent de cas de test unitaire, ainsi que le cas de deux jours rouges consécutifs (15 et 16/01) qui doivent partager les mêmes références (12, 13, 14/01 et 17, 18, 19/01).

## 6. Architecture et choix techniques

### 6.1 Vue d'ensemble

```
┌──────────────┐   HTTPS/WS    ┌──────────────────────┐   REST/WS    ┌──────────────────┐
│  Navigateur  │ ◄───────────► │  Backend Node/TS     │ ◄──────────► │  Home Assistant  │
│  (React SPA) │               │  (Fastify)           │              │  (recorder)      │
└──────────────┘               │  - proxy HA          │              └──────────────────┘
                               │  - moteur de calcul  │   HTTPS      ┌──────────────────┐
                               │  - cache SQLite      │ ◄──────────► │  API Tempo (RTE  │
                               └──────────────────────┘              │  ou tierce)      │
                                                                     └──────────────────┘
```

Application **autonome**, déployée en conteneur Docker sur le réseau local (même machine que HA ou autre). Le backend est indispensable : il garde le token HA hors du navigateur, contourne les problèmes CORS de l'API HA, et met en cache les données.

### 6.2 Récupération des données HA

**API retenue : WebSocket `recorder/statistics_during_period`** (statistiques long terme).

- Paramètres : `statistic_ids: [entité]`, `start_time`, `end_time`, `period: "hour"`, `types: ["sum", "change"]`.
- Réponse : liste de buckets `{start, end, sum, change}` par entité.
- **Granularité** : HA conserve les statistiques **horaires indéfiniment** (long terme) et des statistiques **5 minutes purgées après 10 jours** par défaut (`recorder.purge_keep_days` court terme). La maille horaire demandée pour le zoom est donc **garantie sur tout l'historique** ; la maille 5 min ne l'est que sur les derniers jours et n'est pas exploitée en V1. ✔ Point « à valider avec HA » de l'objectif : **validé**.
- L'alternative REST `/api/history/period` (états bruts) est écartée : purgée après `purge_keep_days` (10 jours par défaut) et beaucoup plus volumineuse.
- Les buckets HA sont alignés sur l'heure UTC ; conversion en `Europe/Paris` côté backend (bibliothèque `luxon` ou `date-fns-tz`).
- Volume : 8 760 buckets/an, chargés par tranches de 31 jours pour rester sous les limites de message WS.
- Pré-requis côté HA : l'entité doit avoir `state_class: total_increasing` (index kWh) ; l'énergie du tableau de bord Énergie HA convient. Le champ `change` est disponible dans les versions récentes de HA (≥ 2023.x) ; à défaut, calcul par différence de `sum`.

**Liste des entités éligibles** : WS `recorder/list_statistic_ids` filtré sur `unit_of_measurement ∈ {kWh, Wh}` et `has_sum = true`.

### 6.3 Stack

| Couche | Choix | Justification |
|---|---|---|
| Langage | TypeScript (strict) partout | code de calcul partagé front/back, typage des grilles tarifaires |
| Backend | Node 22 LTS + **Fastify** | léger, typé, plugin WebSocket, schémas JSON |
| Client HA | `home-assistant-js-websocket` (lib officielle, utilisable côté Node avec `ws`) | gère auth, reconnexion, `subscribeMessage` |
| Persistance | **SQLite** via `better-sqlite3` (+ `drizzle-orm`) | zéro dépendance externe, un fichier dans un volume Docker |
| Front | **React 18 + Vite**, TanStack Query, Zustand | SPA simple, cache des requêtes |
| Graphique | **ECharts** (`echarts-for-react`) | zoom/dataZoom natif, gros volumes (8 760 pts+), coloration par point |
| UI | Tailwind + composants légers (shadcn/ui) | rapidité de dev |
| Tests | Vitest (moteur de calcul), Playwright (parcours) | |
| Packaging | monorepo pnpm : `packages/core` (calcul pur), `apps/api`, `apps/web` ; image Docker multi-stage unique | |

Le moteur de calcul (`packages/core`) est **pur et sans I/O** : entrées = série horaire + grille + créneaux + couleurs, sortie = résultat. Il est testé unitairement à partir des exemples du §5.6 et exécutable indifféremment côté serveur ou navigateur.

### 6.4 Historique des couleurs Tempo

| Source | Avantages | Limites |
|---|---|---|
| Entité HA (ex. intégration *RTE Tempo* de hekmon) | déjà dans le recorder, aucune clé | historique limité à la date d'installation de l'intégration ; lecture via `history/history_during_period` sur le sensor couleur, ou statistiques si l'entité en expose |
| API RTE *Tempo Like Supply Contract* | source officielle, historique complet (≈ 1 an par appel, appels multiples pour plus) | compte data.rte-france.com + OAuth2 client credentials ; quota |
| API tierce publique (`api-couleur-tempo.fr`) | aucune clé, historique complet | dépendance à un tiers non contractuel |
| CSV manuel | toujours possible | saisie utilisateur |

**Décision** : API RTE par défaut ; entité HA et CSV en repli ; API tierce non retenue.

Détail de l'appel RTE : `POST /token/oauth/` (client credentials, jeton valable ~2 h, mis en cache) puis `GET /open_api/tempo_like_supply_contract/v1/tempo_like_calendars?start_date=…&end_date=…` par tranches de 366 jours maximum. Les dates sont exprimées avec l'heure de bascule 06:00 ; le backend ne garde que la date civile de début.

Le backend normalise toutes les sources vers la table `tempo_days(date, color, source)` ; une fois une date renseignée, elle n'est plus re-demandée.

### 6.5 Modèle de données (SQLite)

```
settings          (id=1, ha_url, ha_token_enc, entity_id, tempo_entity_id,
                   subscribed_power_kva, tempo_source, rte_client_id, rte_secret_enc,
                   current_option, smoothing_ref_days=3, smoothing_search_window_days=14,
                   color_switch_hour=6, updated_at)
tariffs           (option ∈ base|hphc|tempo, valid_from, subscription_yearly,
                   price_json)              -- {base} | {hp,hc} | {blue_hp,blue_hc,...}
offpeak_ranges    (id, tariff_set ∈ hphc|tempo, start_min, end_min)   -- minutes depuis 00:00
consumption_hours (start_utc PK, kwh, source_sum, fetched_at)          -- cache HA
tempo_days        (date PK, color ∈ blue|white|red, source, fetched_at)
```

Le cache `consumption_hours` est invalidé pour les **7 derniers jours** à chaque actualisation (HA peut recalculer les statistiques récentes) et conservé au-delà.

### 6.6 API interne (backend → front)

| Méthode | Route | Rôle |
|---|---|---|
| GET/PUT | `/api/settings` | configuration (le token n'est jamais renvoyé, seulement « défini : oui/non ») |
| POST | `/api/ha/test` | test de connexion, retourne version HA + entités éligibles |
| GET | `/api/ha/entities` | liste des entités éligibles |
| POST | `/api/data/sync?from&to` | charge/complète le cache conso + couleurs ; progression via SSE |
| GET | `/api/consumption?from&to&granularity=hour\|day\|month` | série pour le graphique |
| POST | `/api/simulate` | corps `{from, to, currentOption, smoothing: {enabled}}` → résultat complet (§4.2.3) ; les paramètres N et fenêtre viennent des settings |
| GET/POST | `/api/tempo/days?from&to` | lecture / import CSV |

### 6.7 Sécurité

- Application prévue pour un **réseau local** ; **pas d'authentification** en V1 (décision), avec un avertissement dans le README : ne pas exposer l'application sur Internet sans reverse proxy authentifiant.
- Token HA et secret RTE chiffrés au repos (AES-256-GCM avec une clé issue d'une variable d'environnement `APP_SECRET`) ; jamais transmis au navigateur.
- Le backend n'expose au front que les routes ci-dessus, aucun proxy générique vers HA.

### 6.8 Déploiement

- `docker compose up` avec un service unique, volume `/data` pour SQLite. Variables : `APP_SECRET`, `PORT`, `TZ=Europe/Paris`.
- **Décision** : conteneur autonome uniquement, hébergé sur une machine séparée ou sur le même hôte que HA. Aucun packaging en add-on HA en V1 (évolution possible, peu coûteuse une fois l'image Docker existante).

## 7. Exigences non fonctionnelles

| Thème | Exigence |
|---|---|
| Performance | simulation sur 12 mois (8 760 h) < 200 ms côté serveur ; graphique fluide au zoom |
| Chargement initial | 12 mois d'historique HA chargés en < 30 s ; progression affichée ; les chargements suivants n'utilisent que le delta |
| Précision | calculs en centimes d'euro arrondis uniquement à l'affichage ; kWh à 3 décimales |
| Fuseau | tout en `Europe/Paris`, DST géré |
| Résilience | HA indisponible → l'app reste utilisable sur le cache (bandeau « données non actualisées depuis … ») |
| Compatibilité | navigateurs récents (Chrome, Firefox, Safari), responsive ≥ tablette |
| Langue | interface en français ; chaînes externalisées pour une éventuelle traduction |
| Accessibilité | couleurs Tempo doublées d'un libellé/pictogramme (ne pas reposer que sur la couleur) |

## 8. Plan de réalisation (indicatif)

| Lot | Contenu | Livrable |
|---|---|---|
| 0 | Squelette monorepo, Docker, CI (lint + tests) | image qui démarre |
| 1 | `packages/core` : modèle de grille, affectation HP/HC, calcul des 3 options, tests §5.6 | moteur testé |
| 2 | Backend : settings, chiffrement, client HA, sync cache conso, entités | `/api/simulate` fonctionnel avec couleurs Tempo en CSV |
| 3 | Sources Tempo (API RTE, entité HA en repli) | couleurs automatiques |
| 4 | Front : écran de configuration | config complète |
| 5 | Front : écran principal, cartes comparatives, graphique avec zoom | V1 utilisable |
| 6 | Lissage jours rouges (core + UI + superposition graphique) | fonctionnalité complète |
| 7 | Finitions : états d'erreur, jours manquants, README | V1 |

## 9. Décisions prises

| # | Sujet | Décision (03/09/2026) |
|---|---|---|
| 1 | Créneaux HC au pas de 30 min, prorata sur l'heure | **Validé.** Les stats 5 min ne sont pas exploitées. |
| 2 | Fenêtre de couleur Tempo 06:00 → 06:00 | **Validé.** Paramètre avancé conservé. |
| 3 | Lissage jours rouges | Moyenne heure par heure des **3 jours non rouges précédant** et des **3 jours non rouges suivant** la **période rouge** (jours rouges consécutifs regroupés). Un jour rouge n'est jamais une référence. Week-ends non exclus. |
| 4 | Source des couleurs Tempo | **API officielle RTE** par défaut ; entité HA et CSV en repli ; API tierce abandonnée. |
| 5 | Révisions tarifaires | **Une seule grille** appliquée à toute la période. Pas de grilles datées ; le champ `valid_from` n'est qu'informatif. |
| 6 | Puissance souscrite | **Simple clé de saisie**, pas de simulation de changement de puissance. |
| 7 | Déploiement | **Conteneur autonome** ; pas d'add-on HA. |
| 8 | Authentification | **Aucune** en V1 ; usage LAN, avertissement README. |

Aucune question ouverte restante : la spec est prête pour le lot 0.

## 10. Glossaire

- **HA** : Home Assistant.
- **Recorder / statistiques long terme** : mécanisme de HA qui agrège les entités en buckets 5 min (court terme, purgés) et 1 h (long terme, conservés).
- **Tarif Bleu** : tarif réglementé de vente d'EDF pour les particuliers (≤ 36 kVA), décliné en options Base, HP/HC, Tempo.
- **Tempo** : option à 6 prix ; 300 jours bleus, 43 blancs, 22 rouges par saison (1er sept. → 31 août), les rouges uniquement du 1er nov. au 31 mars hors week-end. HP 6 h–22 h, HC 22 h–6 h.
- **Effacement** : réduction volontaire de la consommation les jours rouges.
- **Lissage** : dans ce projet, remplacement de la consommation observée d'un jour rouge par une estimation « sans effacement ».

## 11. Sources consultées

- Home Assistant – action `recorder.get_statistics` (périodes `5minute/hour/day/week/month/year`, purge des stats court terme à 10 jours) : https://www.home-assistant.io/actions/recorder.get_statistics/
- Intégration HA *RTE Tempo* (hekmon/rtetempo) : https://github.com/hekmon/rtetempo
- API RTE *Tempo Like Supply Contract* – guide d'utilisation : https://data.rte-france.com/documents/20182/224298/FR_GU_API_Tempo_Like_Supply_Contract_v01.02.pdf
- Tarif Bleu au 1er août 2026 (Base, HP/HC, Tempo) : https://www.kelwatt.fr/actu/tarif-edf-reglemente-1er-aout-2026 et https://www.fournisseurs-electricite.com/fournisseurs/edf/tarifs/tempo/prix
