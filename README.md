# Cap Finance — mon espace carrière

Application web personnelle pour piloter une recherche de stage en finance : offres (publiées, opportunités cachées, entreprises à prospecter), candidatures, Kanban, réseau, prospection et messages, entreprises, préparation aux entretiens, documents, calendrier, analyse et comparaison.

## Architecture

| Élément | Solution | Coût |
|---|---|---|
| Interface web | Site statique (HTML, CSS, JavaScript sans framework) hébergé sur GitHub Pages | Gratuit |
| Base de données | Supabase (PostgreSQL), projet `cap-finance`, région Paris | Gratuit (500 Mo) |
| Connexion | Supabase Auth (e-mail + mot de passe), un seul compte autorisé | Gratuit |
| Documents | Supabase Storage, espace privé `documents` (50 Mo par fichier, 1 Go au total) | Gratuit |
| Veille quotidienne | Tâche planifiée Claude qui écrit dans la base via le connecteur Supabase | Inclus dans l'abonnement Claude |

Limite de l'offre gratuite Supabase : un projet sans aucune activité pendant 7 jours est mis en pause (réactivation en un clic depuis supabase.com). La veille quotidienne écrit chaque jour dans la base, ce qui la garde active.

## Sécurité

- Chaque table est protégée par des règles d'accès (RLS) : un compte ne lit et n'écrit que ses propres lignes.
- Les inscriptions sont fermées après la création du premier compte.
- La clé présente dans `web/config.js` est la clé publique « anon » : elle est faite pour être visible ; sans connexion elle ne donne accès à aucune donnée.
- La veille passe uniquement par les fonctions du schéma `agent`, inaccessible depuis le site. Ces fonctions ne peuvent qu'ajouter des offres (avec anti-doublon), mettre à jour l'état d'une annonce, compléter une fiche entreprise sans écraser les saisies, et écrire le journal de synchronisation. Elles ne modifient jamais les statuts, dates, notes ni documents.

## Fichiers

- `web/` : l'application (`index.html`, `styles.css`, `app.js`, `content.js`, `config.js`, `data/seed.json` pour la reprise des données initiales).
- `supabase/schema.sql` : schéma complet de la base (tables, règles d'accès, fonctions de la veille, stockage).

## Récupérer ses données / changer d'hébergeur

- Depuis l'application : Paramètres et données → Exporter tout (JSON) ou CSV.
- Depuis Supabase : Database → Backups, ou `pg_dump` avec la chaîne de connexion du projet. Le schéma étant du PostgreSQL standard, il se réinstalle sur n'importe quel PostgreSQL.
- Le site est un ensemble de fichiers statiques : il peut être servi par n'importe quel hébergeur (Netlify, Vercel, Cloudflare Pages, un serveur personnel) en modifiant seulement `config.js`.

## Fonctions de la veille (schéma `agent`)

```sql
select * from agent.offers();                         -- historique complet, pour les doublons
select agent.add_offer('{ "company_name": "...", "title": "...", "kind": "publiee", "link_state": "ok", ... }'::jsonb);
select agent.update_link('OFF-0012', 'bad');           -- ok | mid | unk | bad
select agent.upsert_company('{ "name": "...", "careers_url": "..." }'::jsonb);
select agent.log_sync('{ "found": 12, "verified": 8, "added": 3, "duplicates": 2, "link_updates": 6, "summary": "..." }'::jsonb);
```
