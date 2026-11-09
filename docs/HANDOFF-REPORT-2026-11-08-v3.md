# Rapport de passation v3 — Exotic Fish Cabo, réservation

**Date :** 8 nov. 2026, 20 h 45 (Los Cabos)
**Branche :** `booking-system` · **Code :** `d60ffb8` (fonctions : `8c2c43a`) · **Production :** `main` @ `cf492b8`, **inchangée**
Rien n'a été fusionné ni déployé en production, et aucun paiement live n'est activé.

> Le rapport précédent (`BOOKING-AND-SEO-REPORT.md`) s'arrêtait à `575a844`. Ce rapport-ci couvre `8c2c43a` et `d60ffb8`, qui implémentent toutes les exigences consolidées. Tous les tests ont été **relancés ce soir sur une base neuve**.

Légende : **PASS** = vérifié · **PASS (local)** = vérifié sur le Worker local + D1 locale, Stripe simulé, emails non envoyés · **BLOCKED** = impossible sans une action du propriétaire.

---

## 1. Fichiers modifiés depuis `575a844`

| Fichier | Rôle |
|---|---|
| `src/components/BookingHelp.astro` (nouveau) | CONTACT US + WHATSAPP, présents dans chaque étape |
| `src/pages/book-now.astro` | Aide à chaque étape ; reprise de la réservation (sessionStorage) ; disponibilité revérifiée avant paiement ; dates de remplacement ; reprise après Stripe ; PayPal désactivé ; mise en page mobile de l'aide |
| `src/pages/book-now/confirmation.astro` | Efface la progression enregistrée quand la réservation est terminée |
| `worker/booking/core.ts` | `reserve` renvoie le jeton client (nouvel essai propre) ; montant et date du paiement disponibles pour les emails |
| `worker/booking/emails.ts` | Email propriétaire complet ; email d'exception « ACTION REQUIRED » ; reçu client sans marina ni email |
| `worker/booking/admin.ts`, `admin-page.ts` | Onglet **Clients** (nom + email) |
| `src/data/site.ts`, `src/components/OriginalPage.astro` | Interrupteur de lancement `PUBLIC_BOOKING_LAUNCHED` (désactivé par défaut : boutons de paiement directs conservés) |
| `tests/booking.mjs`, `booking-ui.mjs`, `booking-ux.mjs` (nouveau), `catalogue.mjs` | Tests |
| `scripts/render-emails.ts` (nouveau), `docs/email-samples/*`, `docs/evidence/*` | Emails rendus et captures d'écran |

## 2. Les cinq exigences UX

| # | Exigence | Résultat | Preuve |
|---|---|---|---|
| 1 | CONTACT US (`/contact`) + WHATSAPP aux 6 étapes ; aucun email ni `mailto:` ; progression conservée après un détour | **PASS (local)** | `booking-ux` : « visible at every step (6/6) », « no email address and no mailto: », « progress survives a detour to /contact » (desktop + Pixel 7). Capture : `docs/evidence/m-2-price.png` |
| 2 | Disponibilité affichée avant paiement ; date prise pendant le paiement → message neutre + autres dates, coordonnées conservées | **PASS (local)** | « Available ✓ » dans le devis et le récapitulatif ; test « date taken during checkout → neutral message (no reason), details kept, alternative dates offered », puis réservation créée sur la nouvelle date seulement |
| 3 | Total, acompte, frais 6 % **sur l'acompte seulement**, montant débité, solde | **PASS (local)** | 19 combinaisons au centime (`booking` + `catalogue`) ; écran : $800 / $200 / $12.00 / $212.00 / $600 (`docs/evidence/mobile-pay.png`) |
| 4 | Mobile fluide : champs minimaux, cibles ≥ 44 px, aucun débordement, retour en arrière sans perte | **PASS (local)** | `booking-ux` Pixel 7 : « no horizontal overflow », « touch targets ≥ 44 px », « earlier steps stay open… without data loss » ; `design` 332/332, `layout` 252/252 |
| 5 | Reprise après paiement refusé, annulé, expiré ou abandonné ; pas de doublon | **PASS (local, Stripe simulé)** | Retour depuis Stripe → réservation restaurée ; un nouvel essai ferme l'ancienne session : **1 réservation active, 1 session ouverte** ; un paiement déjà abouti ne peut pas être annulé ni repayé ; 8 tentatives simultanées → 1 seule réussit |

## 3. Liste de clients privée

**PASS (local).** `/booking-admin` → onglet Clients. Colonnes : exactement **Customer name** et **Customer email**. Une ligne par email, sans tenir compte de la casse ; le dernier nom non vide l'emporte.
- Construite à partir des réservations existantes.
- Aucun téléphone, historique, fiche client, recherche ni export.
- Session admin obligatoire (401 sinon).

Tests : 4/4. Capture : `docs/evidence/admin-clients.png`.

## 4. Moyens de paiement

| | État | Résultat |
|---|---|---|
| Stripe | « Card via Stripe (+6% processing fee) » ; 6 % sur l'acompte seulement ; mode test ; une clé live est refusée sans `BOOKING_LIVE=approved` | PASS (local, Stripe simulé) · **BLOCKED** en réel |
| Wise | Réservation en attente pendant 24 h ; confirmée uniquement quand le propriétaire saisit VERIFIED et le montant | PASS (local) |
| PayPal | « PayPal — Coming Soon », visible mais désactivé, sans lien ; le serveur refuse `paypal` | PASS |
| Anciens boutons des pages bateaux | Conservés (build par défaut). Ils disparaissent avec `PUBLIC_BOOKING_LAUNCHED=true` (testé : 0 lien direct, BOOK THIS BOAT conservé) | PASS |

## 5. Emails (rendus et relus visuellement : `docs/evidence/email-*.png`)

| Email | Contenu vérifié | Résultat |
|---|---|---|
| Reçu client « Exotic Fish Cabo — Deposit Received » | Nom, référence, Boat #, date, durée, total, acompte reçu (+ frais si carte), solde, « Loïc will personally send… / Please wait… ». **Ni marina, ni heure, ni TORO, ni email du propriétaire** | PASS (local, 19 combinaisons) |
| Email au propriétaire | En tête : CUSTOMER EMAIL (lien mailto, sélectionnable). Nom, téléphone, référence, Boat # + taille, date, durée, personnes, demandes, total, acompte requis, acompte vérifié, frais carte séparés, total débité, solde, moyen, VERIFIED, horodatage, référence de transaction | PASS (local : Stripe, Wise, champs manquants) |
| Exception (payé mais non confirmé) | « ⚠️ ACTION REQUIRED — payment received, booking NOT confirmed », aucun reçu au client, aucun remboursement automatique, preuve de paiement conservée | PASS (local) |
| Confirmation officielle | Modèle conservé mot pour mot (fixture), jamais envoyée automatiquement, préremplie dans `/booking-admin` | PASS (local) |
| Pas de doublon (webhook rejoué) | Un seul email propriétaire et un seul reçu par réservation | PASS (local) |
| Envoi réel via Resend | — | **BLOCKED** (secrets du staging) |

## 6. Prix, calendrier et SEO/GEO

| Élément | Résultat |
|---|---|
| 19 combinaisons approuvées ; bateau #1 en 6 h seulement (page, devis, réservation, téléphone, 2ᵉ sortie) | PASS (local) |
| 3 réservations manuelles (#2 26/11/2026, #4 15/12/2026, #6 19/01/2027) bloquées, visibles en admin, sans doublon ni email | PASS (local) · **BLOCKED** sur staging (pas de D1) |
| Passé inaccessible (interface + API) ; aucun historique, compte ni identité publics ; limites de requêtes | PASS (local) |
| Liens BOOK NOW → `/book-now` ; préselection `?boat=3` et depuis les pages bateaux | PASS (local) |
| **Comparaison avec `main`** (build de production, 105 pages) | **12 pages modifiées, toutes voulues** : 10 pages bateaux (prix du bateau retiré, BOOK THIS BOAT ajouté), fleet (BOOK THIS BOAT), accueil (paragraphe « Since 2014 » + 1 phrase en double retirée), plus F13 (`description` vide du JSON-LD WebSite). |
| Accueil : titre, meta, H1, canonical | **Identiques** à `main` |
| « $350 », « $600 », `From $600USD`, `priceRange` | Identiques sur toutes les pages, **sauf la page du bateau #1** (prix propre au bateau, retrait autorisé) |
| Avis, Fishing Reports, CMS `/admin/`, chatbot EN/FR/ES, formulaire de contact, redirections, sitemap (+ `/book-now`), robots | PASS : qa 150/150, reviews 51/51, chat 96/96 |

## 7. Résultats de tests réels — LOCAL (relancés ce soir, base neuve)

| Commande | Résultat |
|---|---|
| `PERSIST=/tmp/wpb node tests/booking.mjs` | **380/380** : 231 sur les 19 combinaisons, 16 sur la 2ᵉ sortie, 13 sur la réservation téléphone, 10 sur Wise, 9 sur le webhook, 5 sur les réservations importées, 5 sur la confidentialité du calendrier, 4 sur les clients, 3 sur la reprise après paiement, 4 sur les limites… |
| `node tests/booking-ui.mjs` | **36/36** |
| `node tests/booking-ux.mjs` | **21/21** |
| `node tests/catalogue.mjs` | **12/12** |
| `node tests/qa.mjs` · `chat.mjs` · `reviews.mjs` | 150/150 · 96/96 · 51/51 |
| `node tests/layout.mjs` · `design.mjs` | 252/252 · 332/332 |
| `python3 scripts/compare-builds.py <main>/dist dist` | 12 pages modifiées, toutes voulues |

## 8. Résultats de tests réels — STAGING (`booking-system-fish-cabo.small-boat-4235.workers.dev`)

| Vérification | Résultat |
|---|---|
| Build Cloudflare de chaque commit (`8c2c43a`, `d60ffb8`) | PASS (check GitHub « Workers Builds » : success) |
| Le staging sert `8c2c43a` ; 6 blocs d'aide ; PayPal désactivé ; aucun `mailto:` | PASS (navigateur, 20 h 10) |
| noindex (`X-Robots-Tag`) + robots `Disallow: /` | PASS |
| API de réservation | **BLOCKED** : 503, aucune base D1 liée à la preview (`wrangler.jsonc` n'a pas encore de `database_id` de staging) |
| Stripe test réel, webhook signé réel, Resend réel, admin, réservations importées | **BLOCKED** (D1 puis secrets) |
| Accès protégé (`STAGING_PASSWORD`) | **BLOCKED** : à poser **après** les tests. Aujourd'hui le staging est seulement noindex, ce qui n'est pas une protection d'accès |

Note : à 20 h 20, ton ordinateur n'était plus joignable par le navigateur intégré. La dernière vérification du staging date donc de 20 h 10.

## 9. Bloquants restants

1. **Base D1 du staging** (ton compte Cloudflare) ← **action suivante**
2. Secrets des Previews : `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY` (sk_test), `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`
3. Webhook Stripe en mode test
4. Tests réels ensemble, puis `STAGING_PASSWORD`

## 10. Au lancement (avec ton accord seulement)

- Fusionner vers `main`.
- Base D1 et secrets de production.
- `PUBLIC_BOOKING_LAUNCHED=true` : les anciens boutons de paiement disparaissent.
- Le paiement live est un accord séparé.

## Statut

**NOT READY — BLOCKERS REMAIN** : tout ce qui pouvait être fait sans tes comptes est fait et passe en local. Les tests réels sur le staging dépendent de la base D1, puis des secrets.
