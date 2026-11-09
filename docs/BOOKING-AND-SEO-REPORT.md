# Rapport de passation — Réservation, Cloudflare et SEO de l'accueil

**Date :** 8 novembre 2026 · **Branche :** `booking-system` · **Production :** `main` @ `cf492b8`, non modifiée
**Staging :** https://booking-system-fish-cabo.small-boat-4235.workers.dev (Worker Preview, noindex)

Légende : ✅ fait et testé · ♻️ existait déjà, conservé · 🟡 fait, non vérifié sur staging · ⛔ bloqué (action du propriétaire)

---

## 00. Corrections consolidées (8 nov. 2026, 2ᵉ passage)

**Branche :** `booking-system`. **Production :** `main` @ `cf492b8`, inchangée (rien fusionné, rien déployé, paiements live désactivés).

### Nouveau ou corrigé
- **Aide à chaque étape de `/book-now`** : boutons CONTACT US (`/contact`) et WHATSAPP sur les 6 étapes. Ils s'ouvrent dans un nouvel onglet. Aucun email ni `mailto:` dans le parcours (`src/components/BookingHelp.astro`).
- **Reprise de la réservation** (sessionStorage, effacé à la fermeture de l'onglet, aucune donnée de paiement) : bateau, durée, date, prix, coordonnées et étape sont restaurés après un détour par `/contact`, un rechargement ou un retour depuis Stripe. Un lien `?boat=N` reste prioritaire.
- **Date prise pendant le paiement** : message neutre, puis jusqu'à 4 dates disponibles proches. En cliquer une revérifie la date et le prix, puis ramène directement au paiement avec les mêmes coordonnées. La disponibilité est aussi revérifiée à l'entrée de l'étape de paiement, et affichée (« Available ✓ ») dans le devis et le récapitulatif.
- **Reprise après un paiement abandonné** : un retour depuis Stripe ou un nouvel essai ferme d'abord l'ancienne session Stripe et libère la date. Si l'ancien paiement a déjà abouti, le client est envoyé vers sa confirmation (pas de second débit). `reserve` renvoie le jeton du client pour permettre cette reprise.
- **PayPal** : option visible mais désactivée, « PayPal — Coming Soon », sans lien. Le serveur refuse `paypal`.
- **Liste de clients** (`/booking-admin` → Clients) : **nom + email seulement**, une ligne par email (sans tenir compte de la casse), le dernier nom non vide l'emporte. Construite à partir des réservations, sans export. Accessible uniquement avec la session admin.
- **Email au propriétaire complet** :
  - en tête : email du client, nom, téléphone ;
  - réservation : référence, bateau et taille, date, durée, personnes, demandes ;
  - montants : total, acompte requis, acompte vérifié, frais carte **séparés**, total débité, solde ;
  - paiement : moyen, statut VERIFIED, horodatage, référence de transaction ;
  - un champ manquant s'affiche « (no email given) / (none) », jamais une valeur inventée.
- **Email d'exception** : sujet « ⚠️ ACTION REQUIRED — payment received, booking NOT confirmed ». Il précise que le client n'a reçu aucun reçu et qu'aucun remboursement n'a été fait.
- **Reçu client** : ne montre plus ni email ni marina (pied de page neutre). Il renvoie vers WhatsApp et `/contact`.
- **Interrupteur de lancement** : avec `PUBLIC_BOOKING_LAUNCHED=true` au build, les anciens boutons Stripe/PayPal/Wise disparaissent des 10 pages bateaux. BOOK THIS BOAT et « Next Boat » restent. Testé : 0 lien de paiement direct avec l'interrupteur, et les liens présents sans lui (le build par défaut = la production actuelle).
- **Échantillons d'emails rendus** : `docs/email-samples/` (Stripe, Wise, champs manquants, reçu client, exception), générés par `scripts/render-emails.ts`. Ces rendus ont été vérifiés visuellement.

### Matrice d'acceptation
Légende : PASS local = Worker + D1 locales, Stripe simulé, emails non envoyés (dry-run). Rien n'a encore été testé sur le staging réel.

| Domaine | Élément | Résultat |
|---|---|---|
| Réservation | 19 combinaisons de prix, au centime | PASS local |
| | Bateau #1 sans option 8 h (page, devis, réservation, téléphone, 2ᵉ sortie) | PASS local |
| | SHOW MY PRICE avant les coordonnées | PASS local |
| | Acomptes ; frais Stripe sur l'acompte seulement ; Wise sans frais | PASS local |
| | Liens BOOK NOW (menu, mobile, 20 boutons), préselection `?boat=3` | PASS local |
| | Aucun prix individuel sur les pages bateaux et la liste de `/book-now` | PASS |
| | « From $350 / $600 » et `$600USD` de l'accueil inchangés | PASS (comparaison avec `main`) |
| UX | CONTACT US + WHATSAPP aux 6 étapes ; aucun email ni mailto | PASS local (desktop + Pixel 7) |
| | Progression conservée après `/contact` ; retour en arrière sans perte | PASS local |
| | Disponibilité affichée avant paiement ; dates de remplacement | PASS local |
| | Mobile : aucun débordement, cibles ≥ 44 px | PASS local |
| | Retour depuis Stripe → reprise, une seule réservation, une seule session ouverte | PASS local (Stripe simulé) |
| | Pas de double débit, pas de double réservation (8 tentatives simultanées) | PASS local |
| Admin | Authentification `/booking-admin` ; `/admin` = Sveltia | PASS local |
| | Liste clients nom + email, sans doublon | PASS local |
| | 2ᵉ sortie, vérification Wise, réservation téléphone | PASS local |
| Calendrier | Passé bloqué dans l'interface et l'API ; aucun historique ni compte | PASS local |
| | 3 réservations manuelles bloquées | PASS local · BLOCKED sur staging (pas de D1) |
| | Limites de requêtes | PASS local |
| Paiements / emails | Paiement Stripe test réel, webhook signé réel | **BLOCKED** (clés + webhook à configurer) |
| | Webhook dupliqué, signature, exception paiement sans confirmation | PASS local (événements signés simulés) |
| | Reçu client, email propriétaire complet, aucune confirmation officielle automatique | PASS local (contenu) · **NOT TESTED** en envoi réel Resend |
| | PayPal visible et désactivé | PASS local |
| Régression | Titre, meta, H1, canonical de l'accueil ; JSON-LD (sauf F13) ; avis ; Fishing Reports ; contact ; chatbot ; CMS ; redirections ; sitemap ; design mobile | PASS (compare-builds + qa 150/150, reviews 51/51, chat 96/96, layout 252/252, design 332/332) |
| | Aucun nom de bateau ni de capitaine dans les textes ajoutés | PASS |

Commandes : `node tests/booking.mjs` **380/380**, `node tests/booking-ui.mjs` **36/36**, `node tests/booking-ux.mjs` **21/21**, `node tests/catalogue.mjs` **12/12**, `python3 scripts/compare-builds.py <main>/dist dist` : 12 pages modifiées, toutes voulues.

### Actions du propriétaire restantes, dans l'ordre
1. Créer la base D1 `fish-cabo-bookings-staging` et me donner son Database ID.
2. Poser les secrets des Previews (je guiderai écran par écran).
3. Créer le webhook Stripe en mode test.
4. Test réel ensemble (carte 4242…, Wise, emails), puis protéger le staging (`STAGING_PASSWORD`).

### À faire au lancement (après ton accord, pas avant)
- Fusionner `booking-system` → `main`.
- Créer la base D1 de production et la lier.
- Poser les secrets de production.
- Build avec `PUBLIC_BOOKING_LAUNCHED=true` : les anciens boutons de paiement disparaissent.
- Passage en paiement live : accord séparé (`BOOKING_LIVE=approved` + clé live).

**Statut : NOT READY — BLOCKERS REMAIN** (staging D1, secrets, Stripe test réel, Resend réel).

## 0. Corrections finales du propriétaire (8 nov. 2026, soir) — commit `575a844`

| Décision | État |
|---|---|
| Email client automatique = **reçu d'acompte seulement** (« Exotic Fish Cabo — Deposit Received ») : nom, référence, Boat #N, date, durée, total, acompte reçu, solde, texte « Loïc will personally send… / Please wait… ». Aucune indication de la marina ni de l'heure | ✅ local (19 combinaisons) |
| L'email de confirmation officiel n'est **plus envoyé automatiquement**. Le modèle est conservé mot pour mot et proposé prérempli dans `/booking-admin` (bouton « Write official confirmation ») | ✅ local |
| Email au propriétaire : **CUSTOMER EMAIL** (lien mailto) et téléphone/WhatsApp en tête | ✅ local |
| Calendrier public : seulement Available / Unavailable, aucun jour passé, mois passés et mois hors fenêtre refusés côté serveur, message neutre, limite de 90 consultations/h par IP. L'historique complet reste dans `/booking-admin` | ✅ local |
| 3 réservations manuelles (#2 26/11/2026, #4 15/12/2026, #6 19/01/2027) importées comme jours bloqués « MANUAL BOOKING », une seule fois, sans doublon, sans client/prix/paiement inventé, sans email | ✅ local. ⏳ sur staging dès que D1 est en place |
| « From $350 » / « From $600 » : la correction « $600USD » de l'accueil est **annulée** ; texte identique à la production. Seule la page bateau #1 n'affiche plus son « From $350 », car c'est un prix propre au bateau (point 5.1) | ✅ (vérifié page par page contre `main`) |
| Boutons de paiement directs des pages bateaux : **conservés** jusqu'à l'autorisation de mise en production | ✅ |
| Lien court à envoyer aux clients : `/book-now?boat=3` | ✅ |

Tests : booking **370/370**, booking-ui **36/36**, catalogue 11/11, qa 150/150, chat 96/96, reviews 51/51, layout 252/252, design 332/332. Build Cloudflare Preview : success.

## A. État par exigence

| Exigence | État | Preuve |
|---|---|---|
| Déploiement Cloudflare de la branche | ✅ | Build `6388e5e6` : success. La preview répond (200, `X-Robots-Tag: noindex`, robots `Disallow: /`) |
| Cause de l'échec précédent | ✅ trouvée | Workers Builds lance `npx wrangler preview`, qui exige un bloc `previews` (message vérifié dans le code de Wrangler 4.156.2) |
| Base D1 sur staging | ⛔ | Les Previews n'héritent pas de D1 et `wrangler preview` ne crée pas la base. Il faut le `database_id` de `fish-cabo-bookings-staging` |
| 19 combinaisons de prix, bateau #1 en 6 h seulement | ✅ local | `tests/catalogue.mjs` 11/11, `tests/booking.mjs` (19 devis, 19 réservations Stripe) |
| Acompte fixe, solde = total − acompte, frais 6 % sur l'acompte seulement | ✅ local | Montants des 19 combinaisons vérifiés au centime |
| Aucun prix public (pages, JSON-LD, JS, HTML caché) | ✅ | Prix uniquement dans `worker/booking/pricing.ts` et D1. Grille absente des 121 fichiers publics |
| Parcours SHOW MY PRICE (6 étapes, devis invalidé à chaque changement) | ✅ local | `tests/booking-ui.mjs` 31/31 (desktop et mobile Pixel 7) |
| Anti-collecte discrète | ✅ local | En-tête de page + même origine, 40 devis/h et 120/jour par IP, aucun captcha avant le prix |
| Libellé « Card via Stripe (+6% processing fee) » | ✅ | Test HTML + navigateur |
| Phrase CGV / confidentialité à la place de la case | ✅ | Version `terms:2026-03;privacy:2026-02` et horodatage enregistrés. Voir le risque juridique en G |
| REQUEST AVAILABILITY → WhatsApp prérempli | ✅ local | wa.me/526241223506 avec bateau, date, durée, coordonnées et demandes. Le client appuie lui-même sur Envoyer |
| Une sortie par bateau et par jour, sans double réservation | ♻️ ✅ | Index unique D1 ; 8 tentatives simultanées → 1 seule réussit |
| Holds 35 min / 24 h / 48 h, cron horaire | ♻️ ✅ local | Inchangés. Le cron ne tourne **pas** sur les Previews (limite Cloudflare) ; les holds expirés sont aussi libérés à chaque requête |
| Délai de 24 h, départ de référence 6:30 | ✅ | Le réglage était à 6:00 ; il est maintenant à 6:30, comme dans l'email client |
| Fuseau horaire | ✅ vérifié | America/Mazatlan = Baja California Sur, UTC−7, sans heure d'été (IANA zone.tab). Aucun changement de code |
| Tableau de bord `/booking-admin` (Sveltia reste sur `/admin/`) | ✅ local | Tests : `/admin/` = Sveltia ; `/booking-admin` = noindex, no-store, frame DENY |
| Réservation téléphone (~1 min) | ✅ local | Nouvel onglet « New phone booking » : prix automatique ; acompte reçu (VERIFIED) / lien carte / Wise |
| Deuxième sortie SECOND TRIP | ♻️ ✅ | Utilise maintenant le prix approuvé (plus de total saisi à la main) |
| Vérification Wise manuelle | ♻️ ✅ local | Confirmation uniquement après saisie de VERIFIED par le propriétaire |
| Webhook Stripe signé et idempotent | ♻️ ✅ local (mock) | 🟡 Jamais testé avec le vrai Stripe (mode test) |
| Un email propriétaire et un reçu d'acompte client, uniquement après paiement vérifié | ♻️ ✅ local (dry-run) | 🟡 Envoi réel via Resend non testé |
| Modèle d'email officiel | ♻️ ✅ | `tests/fixtures/...txt` est identique mot pour mot au modèle. Il n'est **plus envoyé automatiquement** (voir 0) : il est prérempli dans `/booking-admin` |
| Aucun nom de bateau dans les textes destinés aux clients | ✅ | Stripe, emails et statut utilisent « Boat #N (X ft) » |
| BOOK NOW → `/book-now`, préselection depuis les pages bateaux | ♻️ ✅ | Menu, barre mobile, 20 boutons BOOK THIS BOAT |
| Chatbot EN/FR/ES | ✅ | Bouton réserver → `/book-now` (avant : `/contact`), étapes mises à jour, PayPal conservé ; `tests/chat.mjs` 96/96 |
| Turnstile 110200 | ✅ cause trouvée | La clé réelle n'est autorisée que sur certains domaines. Hors fish-cabo.com : clé et secret de **test** publics Cloudflare. Sur fish-cabo.com, le secret réel est **obligatoire** |
| `/api/booking/boats` en 404 en local | ✅ cause trouvée | `astro dev` ne lance pas le Worker. `astro dev` relaie maintenant `/api` vers `npm run dev:worker` (port 8787) |
| « Online booking is not available right now » | ✅ cause trouvée | Conséquence directe du 404 ci-dessus ; la base n'y était pour rien |
| SEO de l'accueil | ✅ | Voir D |
| Avis (≥ 3 par plateforme) | ♻️ | 5 Google + 5 Tripadvisor, tous authentiques, non modifiés ; `tests/reviews.mjs` 51/51 |
| Fishing Reports, CMS, notification | ♻️ | Non touchés ; build + `check-reports` OK, sitemap identique (+ `/book-now`) |

## B. Fichiers

**Créés**
- `worker/booking/pricing.ts` : prix et acomptes approuvés (serveur seulement).
- `public/js/efc-turnstile.js` : clé Turnstile choisie selon le domaine.
- `tests/catalogue.mjs`, `tests/booking-ui.mjs` : nouveaux tests.
- `scripts/compare-builds.py` : comparaison de deux builds de production.
- Ce rapport.

**Modifiés**
- `wrangler.jsonc` : bloc `previews`.
- `worker/index.ts` : routes `/booking-admin`, `/quote`, `/summary` ; Turnstile du formulaire de contact selon le domaine.
- `worker/booking/core.ts` : devis, résumé, durées, version CGV, libellé du bateau, 6:30.
- `worker/booking/admin.ts` : réservation téléphone ; prix approuvé pour la 2ᵉ sortie.
- `worker/booking/admin-page.ts` : onglet téléphone, affichage mobile.
- `worker/booking/emails.ts` : « Boat #N », référence de paiement.
- `worker/booking/schema.ts` : `terms_version`, méthode `other`, réglage des minutes de départ, seed depuis `pricing.ts`.
- `src/pages/book-now.astro` : nouveau parcours.
- `src/data/boats.json` : prix et acomptes retirés.
- `src/data/content-edits.json` et `src/data/original/fishing-boats/{23ft,26ft,27ft,30ft,31ft}*.json`, `home.json` : textes.
- `src/lib/seo-fixes.ts`, `scripts/seo_fixes.py` : F13.
- `scripts/apply_content_edits.py` : prise en charge des suppressions.
- `src/components/ContactForm.astro` : chargement Turnstile.
- `public/js/efc-chat.js`.
- `astro.config.mjs` : proxy de dev.
- `package.json` : `dev:worker`.
- `tests/booking.mjs`.

**Supprimés :** aucun.

## C. Réservation (résumé technique)

- `GET /api/booking/boats` : bateaux, capacités, durées. Aucun prix, aucun acompte.
- `POST /api/booking/quote` : un seul devis (bateau + durée + date disponible) → total seulement. En-tête `x-efc-quote` et même origine exigés ; limites par IP.
- `POST /api/booking/summary` : après le devis, renvoie l'acompte, les frais carte (6 % de l'acompte), le total débité et le solde en espèces.
- `POST /api/booking/reserve` : recalcule tout côté serveur. Refuse le bateau #1 en 8 h. Plus de case à cocher ; la version des CGV est enregistrée.
- `POST /api/admin/phone-booking` : réservation par téléphone (session admin).

## D. SEO de l'accueil

**Comparaison** de la production `main` avec la branche, build de production, 105 pages : **12 pages changent**, plus F13 sur toutes les pages, et rien d'autre. Les mentions « $350 » et « $600 » sont identiques sur toutes les pages, sauf sur la page du bateau #1.
- Accueil : ajout d'un H3 « A Reputation for Excellence Since 2014 » avec le texte du propriétaire, en tête de « Why Choose Exotic Fish Cabo? ».
- Accueil : suppression de la phrase d'« About » qui répétait « Why Choose » (« From your first questions… prepare for your trip. »).
- Accueil : « From $600USD » laissé **tel quel** (correction annulée à la demande du propriétaire).
- Accueil : titre, meta description, H1, canonical, OG et Twitter **inchangés**.
- Pages bateaux : prix retirés du texte, des titles et des meta (accord du 8 novembre). Le « From $500 » du #2 était faux (le prix réel est $550).
- Fleet et pages bateaux : boutons BOOK THIS BOAT (déjà dans la branche).
- Toutes les pages (F13) : `"description": ""` retiré du JSON-LD WebSite. Une propriété vide est invalide ; aucun texte n'a été inventé.
- Sitemap : identique, plus `/book-now`. robots.txt identique. Redirections non touchées.

**Conservé volontairement**
- « From $350 » (6 h) et « From $600 » (8 h) dans le texte, la meta et `priceRange "$350-$600+"` : ce sont exactement les prix d'entrée de gamme approuvés (#1 en 6 h, #2 en 8 h). Ils ne sont ni faux ni une grille.
- Le lien vers le dernier Fishing Log : un `<a>` statique pointe vers `/fishing-reports/san-jose-del-cabo-fishing-log-october-26-november-1-2026` (vérifié dans le build), et `tests/qa.mjs` contrôle qu'il s'agit bien du plus récent.

**Non fait (optionnel, à valider)**
- Le H3 « Personal Service Before Your Trip » chevauche encore « A Local Fishing Charter Service ».
- Les coordonnées `geo` du JSON-LD sont encore les anciennes (décision en attente depuis le rapport phase 1-3).

## E. Validation réellement exécutée (sandbox, Worker local + D1 locale)

| Commande | Résultat |
|---|---|
| `node tests/booking.mjs` (Stripe simulé, emails en dry-run) | **370/370** (après les corrections finales) |
| `node tests/booking-ui.mjs` (Playwright, desktop + Pixel 7) | **36/36** |
| `node tests/catalogue.mjs` | **11/11** |
| `tests/qa.mjs` / `chat.mjs` / `reviews.mjs` | 150/150 · 96/96 · 51/51 |
| `tests/layout.mjs` / `design.mjs` | 252/252 · 332/332 |
| `python3 scripts/compare-builds.py <main>/dist dist` | 12 pages modifiées, toutes voulues |
| `scripts/verify-original.py` | ⚠️ **non exécutable** ici : l'export Squarespace (`/home/claude/export`) n'existe pas dans cet environnement. Remplacé par `compare-builds.py` |
| Build Cloudflare Preview | success |
| Staging : API, D1, Stripe test, Resend, Turnstile réel, cron | ⛔ / 🟡 non vérifiés : attendent la base D1 et les secrets |

Test local sous Windows : `npm run dev:worker` (terminal 1), puis `npm run dev` (terminal 2), puis http://localhost:4321/book-now. Ou directement http://127.0.0.1:8787/book-now.

## F. Actions du propriétaire (dans l'ordre)

1. **D1 staging** : créer `fish-cabo-bookings-staging` et me donner son Database ID.
2. **Secrets des Previews** (Workers & Pages → fish-cabo → Settings → Previews / « Preview base config » → Variables and secrets) :
   - `ADMIN_PASSWORD` ;
   - `STRIPE_SECRET_KEY` (sk_test_…) ;
   - `STRIPE_WEBHOOK_SECRET` ;
   - `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM` (mêmes valeurs qu'en production) ;
   - puis `STAGING_PASSWORD` **après** les tests (sans lui, le staging est public mais noindex).
3. **Stripe (mode test)** : créer un webhook vers `https://booking-system-fish-cabo.small-boat-4235.workers.dev/api/stripe/webhook`. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `charge.refunded`.
4. Faire un test réel avec la carte Stripe de test 4242 4242 4242 4242, puis valider.
5. Plus tard, par accords séparés : fusion vers `main`, puis paiement live (`BOOKING_LIVE=approved` + clé live).

## G. Risques et décisions ouvertes

- **Phrase CGV sans case à cocher.** Un cabinet mexicain (Basham, janvier 2025) rapporte une décision selon laquelle la simple publication des CGV ne prouve pas leur acceptation, et recommande un mécanisme d'acceptation explicite. Ici, le clic sur « PAY DEPOSIT & BOOK », juste sous la phrase, avec la version enregistrée, est plus solide qu'une simple publication. Ce n'est pas un avis juridique : à faire confirmer par un avocat.
- **Clause « la version espagnole prévaut »** alors qu'aucune version espagnole n'existe : toujours en attente.
- **Liens Stripe / Wise / PayPal historiques des pages bateaux** : conservés, conformément au document de corrections. Ils permettent de payer un acompte **sans** passer par le calendrier, donc sans contrôle de disponibilité. Le bouton PayPal n'a pas de lien : il est informatif. Décision à prendre avant la production.
- **Le cron ne tourne pas sur les Previews.** Il sera vérifiable seulement en production, ou via les holds libérés à chaque requête.
- **« Bot WhatsApp »** : il n'existe aucun bot WhatsApp dans le dépôt, seulement le transfert du chatbot vers WhatsApp (numéro +52 624 122 3506 vérifié partout).
- `src/data/boats.ts` n'est importé nulle part. Il est conservé ; sa synchronisation avec `boats.json` est testée.

## H. Statut

**NOT READY — BLOCKERS REMAIN** : base D1 du staging, secrets, webhook Stripe test, puis test réel des paiements et des emails.
