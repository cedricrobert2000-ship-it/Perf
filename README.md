# PERF® — Run Club

La web app du club, entre potes : on poste des sorties, on s'inscrit, on récupère son **dossard**.

Hébergée gratuitement sur **GitHub Pages** (lien `https://<ton-pseudo>.github.io/<repo>/`), avec les données partagées dans **Supabase** (gratuit).

## Fonctionnalités

- **Profil sans mot de passe** : pseudo + couleur. Un lien de connexion perso permet de récupérer son compte sur un autre téléphone. Code du club optionnel pour bloquer les inconnus.
- **Events** : run, sortie longue, fractionné, trail, vélo, social run. Date, lieu, distance, allure, nombre de places, description, photo (presets ou depuis le téléphone).
- **Inscription → dossard** : numéro attribué automatiquement (001, 002…), dossard avec QR code, téléchargeable en PNG.
- **Check-in le jour J** : l'orga scanne le QR code du dossard ou tape le numéro.
- **Chronos & classement** : après le départ, chacun saisit son temps → podium + allure au km.
- **Le mur** : messages par event (rdv, covoit, playlist…).
- **Mes dossards** + **Club** (classement d'assiduité, km courus ensemble).
- Ajout à l'agenda (.ics), partage, installable sur l'écran d'accueil.

## Mise en ligne (10 minutes, une seule fois)

### 1. Créer la base Supabase

1. Crée un compte sur [supabase.com](https://supabase.com) → **New project** (plan gratuit, région Europe).
2. Va dans **SQL Editor** → **New query**, colle tout le contenu de [`supabase/schema.sql`](supabase/schema.sql) et clique **Run**.
3. Va dans **Project Settings → API** et note :
   - le **Project URL** (`https://xxxx.supabase.co`)
   - la clé **anon public**

> La clé *anon* est faite pour être publique : elle permet seulement d'appeler les fonctions du club, jamais de lire les tables (et donc jamais les liens de connexion des membres).

### 2. Brancher GitHub

Dans ton repo GitHub :

1. **Settings → Secrets and variables → Actions → onglet Variables → New repository variable**, crée :
   - `VITE_SUPABASE_URL` = ton Project URL
   - `VITE_SUPABASE_ANON_KEY` = ta clé anon public
2. **Settings → Pages → Source : GitHub Actions**.

### 3. Déployer

Onglet **Actions** → **Deploy to GitHub Pages** → **Run workflow** (ensuite ça se redéploie tout seul à chaque push sur la branche par défaut).

Le lien apparaît dans **Settings → Pages**. Balance-le sur le groupe WhatsApp 🏃

## Réglages du club

Dans Supabase → **Table Editor → `club_config`** :

| Colonne | Rôle |
|---------|------|
| `name`  | Nom affiché du club (`PERF` par défaut) |
| `code`  | Si rempli, code demandé pour rejoindre le club (ex. `goperf`) |

Les 3 events de démo sont créés uniquement si la base est vide ; supprime-les depuis l'app (ou la table `events`) quand tu veux.

## En local

```bash
npm install
VITE_SUPABASE_URL=https://xxxx.supabase.co VITE_SUPABASE_ANON_KEY=... npm run dev
```

## Stack

React 18 + Vite · Supabase (Postgres, fonctions RPC) · GitHub Pages · `qrcode`.
