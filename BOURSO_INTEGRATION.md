# Intégration Boursorama API - Guide d'utilisation

## Vue d'ensemble

Vous avez une intégration complète entre MyMoney et l'API Boursorama qui vous permet de :
- ✅ Synchroniser vos comptes Boursorama directement dans l'app
- ✅ Effectuer des virements entre vos comptes
- ✅ Passer des ordres de trading (achats/ventes d'ETF)
- ✅ Suivre l'historique de vos actions Bourso

## Architecture

### 1. Backend (Node.js)

**Service Bourso** (`server/services/bourso.ts`)
- Wrapper autour du CLI Rust bourso-api
- Méthodes disponibles :
  - `getBoursoAccounts(password)` - Récupère vos comptes
  - `placeBoursoOrder(order, password)` - Place un ordre de trading
  - `performBoursoTransfer(transfer, password)` - Effectue un virement
  - `getBoursoQuote(symbol)` - Récupère les cotations
  - `validateBoursoCredentials()` - Valide les identifiants

**Routes API** (`server/routes/bourso.ts`)
- `POST /api/bourso/accounts/sync` - Synchroniser les comptes
- `POST /api/bourso/transfer` - Effectuer un virement
- `POST /api/bourso/order` - Passer un ordre de trading
- `GET /api/bourso/quote/:symbol` - Obtenir une cotation
- `GET /api/bourso/actions` - Lister l'historique des actions
- `GET /api/bourso/actions/:id` - Détails d'une action
- `POST /api/bourso/validate` - Valider les identifiants

### 2. Frontend (React)

**API Client** (`src/lib/api-bourso.ts`)
- Méthodes TypeScript pour appeler les endpoints Bourso
- Gestion des erreurs centralisée

**Composants UI**
- `BoursoTransferModal` - Interface pour les virements
- `BoursoTradeModal` - Interface pour placer des ordres
- `BoursoActionsWidget` - Affichage de l'historique des actions

**Intégration** (`src/components/AccountsTab.tsx`)
- Boutons "Virement" et "Trading" dans le header
- Widget d'historique des actions Bourso

## Utilisation

### Configuration requise

```bash
# S'assurer que bourso-cli est compilé
cd /Users/Louis-Marie\ PERRET\ DU\ CRAY/Documents/bourso\ api/bourso-api
cargo build --release

# La variable d'environnement BOURSO_CLI_PATH doit pointer vers le binaire compilé
# Par défaut : /Users/Louis-Marie PERRET DU CRAY/Documents/bourso api/bourso-api/target/release/bourso-cli
```

### Synchroniser vos comptes Boursorama

1. Cliquez sur le bouton "Sync comptes" dans le widget Bourso Actions
2. Entrez votre mot de passe Boursorama
3. Vos comptes seront synchronisés et apparaîtront dans l'historique

### Effectuer un virement

1. Cliquez sur le bouton "💸 Virement" dans le header
2. Sélectionnez le compte source et destination
3. Entrez le montant (minimum 10€)
4. Entrez votre mot de passe Boursorama
5. Validez

### Passer un ordre de trading

1. Cliquez sur le bouton "📈 Trading" dans le header
2. Sélectionnez votre compte de trading (PEA, CTO, etc.)
3. Entrez le symbole de l'actif (ex: `1rTCW8` pour AMUNDI MSCI WORLD)
   - Trouvez le symbole dans l'URL Boursorama du produit
   - Exemple: https://www.boursorama.com/bourse/trackers/cours/1rTCW8/ → symbole `1rTCW8`
4. Choisissez entre Achat ou Vente
5. Entrez la quantité
6. (Optionnel) Entrez un prix limite pour un ordre limité
7. Entrez votre mot de passe Boursorama
8. Validez

### Affichage de l'historique

Le widget "Actions Bourso" affiche vos 10 dernières actions :
- 🔄 Synchronisations de comptes
- 💸 Virements
- 📈 Ordres de trading

État des actions :
- ✅ Complété (vert)
- ⏳ En attente (jaune, animé)
- ⚠️ Échoué (rouge)

## Types TypeScript

```typescript
// Types disponibles en src/types-bourso.ts
type BoursoAccount = {
  id: string
  name: string
  balance: number
  bankName: string
  kind: 'Banking' | 'Trading' | 'Savings'
}

type TradeOrder = {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  accountId: string
  price?: number // pour ordres limités
}

type Transfer = {
  fromAccountId: string
  toAccountId: string
  amount: number
  label?: string
}

type BoursoAction = {
  id: string
  type: 'transfer' | 'trade' | 'sync-accounts'
  status: 'pending' | 'completed' | 'failed'
  source: 'bourso'
  data: Record<string, unknown>
  createdAt: string
  completedAt?: string
  error?: string
}
```

## Security

⚠️ **Important**
- Les mots de passe Boursorama ne sont **jamais stockés**
- Ils sont transmis en HTTPS via POST à chaque action
- Ils ne restent en mémoire que le temps de la requête
- Utilisez une technologie de sécurité Boursorama en fonction de votre configuration (PIN virtuel, 2FA, etc.)

## Troubleshooting

### "Cannot find bourso-cli binary"
- Vérifiez que le chemin dans BOURSO_CLI_PATH existe
- Vérifiez que le binaire a les permissions d'exécution
- Vérifiez que le build Rust a réussi: `cargo build --release`

### "Authentication failed"
- Assurez-vous que votre mot de passe est correct
- Si vous changez d'adresse IP, Boursorama peut demander une vérification 2FA
- Assurez-vous que votre compte Bourso n'a pas un accès restreint

### "Order failed"
- Assurez-vous que votre compte de trading a un solde suffisant
- Vérifiez que le symbole de l'actif est correct
- Vérifiez les conditions de marché (heures de bourse, volumes, etc.)

## Développement

### Ajouter une nouvelle action Bourso

1. Ajouter la méthode au service (`server/services/bourso.ts`)
2. Ajouter la route API (`server/routes/bourso.ts`)
3. Ajouter la méthode API client (`src/lib/api-bourso.ts`)
4. Créer le composant UI ou modal
5. Intégrer au composant approprié

### Déboguer les appels API

Tous les appels Bourso CLI sont loggés via le logger centralisé.
Vérifiez les logs du serveur pour les détails.

## Fichiers impactés

- ✅ `src/types-bourso.ts` - Nouveaux types
- ✅ `src/types.ts` - Réexportation des types Bourso
- ✅ `src/lib/api-bourso.ts` - Client API Bourso
- ✅ `src/components/BoursoTransferModal.tsx` - Modal de virements
- ✅ `src/components/BoursoTradeModal.tsx` - Modal de trading
- ✅ `src/components/BoursoActionsWidget.tsx` - Widget historique
- ✅ `src/components/AccountsTab.tsx` - Intégration UI
- ✅ `server/services/bourso.ts` - Service wrapper
- ✅ `server/routes/bourso.ts` - Routes API
- ✅ `server/index.ts` - Enregistrement des routes
