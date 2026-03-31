# Bourso API - Guide de setup

## Prérequis

- Node.js 18+
- Rust 1.77.2+
- Un compte Boursorama / BoursoBank
- macOS (le script de launchd fourni) ou Linux/Windows

## 1. Compiler bourso-api

```bash
cd /Users/Louis-Marie\ PERRET\ DU\ CRAY/Documents/bourso\ api/bourso-api

# Build en release (version optimisée)
cargo build --release

# Le binaire compilé se trouve à :
# target/release/bourso-cli
```

## 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine de MyMoney si ce n'est pas déjà fait :

```env
# Bourso CLI path (chemin vers le binaire compilé)
BOURSO_CLI_PATH=/Users/Louis-Marie PERRET DU CRAY/Documents/bourso api/bourso-api/target/release/bourso-cli

# Autres variables existantes...
API_PORT=8000
CORS_ORIGIN=http://localhost:5173
```

## 3. Vérifier la configuration Bourso

```bash
# Test: vérifier que bourso-cli répond
/Users/Louis-Marie\ PERRET\ DU\ CRAY/Documents/bourso\ api/bourso-api/target/release/bourso-cli --help

# Ou depuis myMoney:
npm run dev
# Allez à http://localhost:5173/accounts
# Cliquez sur "Sync comptes"
```

## 4. Configuration Boursorama requise

### Créer un ID de client Bourso (optionnel mais recommandé)

```bash
./bourso-cli config --username <votre_customer_id>
```

### Variables de sécurité

Assurez-vous que votre compte Bourso a :
- ✅ Authentification 2FA activée
- ✅ VirtualPad (clavier virtuel) configuré pour les mots de passe
- ✅ IP reconnue (sinon la première connexion demandera une vérification)

## 5. Utilisation en production

### macOS - Lancer en arrière-plan avec launchd

Le fichier `bourso-launchd.sh` fourni dans le projet bourso-api peut être utilisé pour lancer des tâches automatiques (ex: DCA hebdomadaire).

### Linux / Docker

Si vous utilisez Docker:
```dockerfile
# Installer Rust dans l'image
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Build bourso-cli
RUN cd /app/bourso-api && cargo build --release

# Utiliser le binaire compilé
ENV BOURSO_CLI_PATH=/app/bourso-api/target/release/bourso-cli
```

## 6. Tester chaque fonctionnalité

### Test 1 : Synchronisation des comptes
```bash
curl -X POST http://localhost:8000/api/bourso/accounts/sync \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}'
```

### Test 2 : Obtenir une cotation
```bash
curl http://localhost:8000/api/bourso/quote/1rTCW8?length=30&interval=1d
```

### Test 3 : Effectuer un virement
```bash
curl -X POST http://localhost:8000/api/bourso/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "transfer": {
      "fromAccountId": "account1",
      "toAccountId": "account2",
      "amount": 100
    },
    "password": "your_password"
  }'
```

### Test 4 : Passer un ordre de trading
```bash
curl -X POST http://localhost:8000/api/bourso/order \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "symbol": "1rTCW8",
      "side": "buy",
      "quantity": 1,
      "accountId": "trading_account_id"
    },
    "password": "your_password"
  }'
```

## 7. Troubleshooting

### Erreur: "Cannot find module"
```bash
# Réinstaller dépendances
npm install

# Recompiler TypeScript
npm run build
```

### Erreur: "Response timeout"
- Le serveur Bourso peut être lent
- Assurez-vous que votre connexion Internet est stable
- Vérifiez que Bourso ne demande pas de vérification 2FA

### Erreur: "Authentication failed"
- Vérifiez que le mot de passe est correct
- Vérifiez que votre compte n'a pas été désactivé
- Attendez quelques minutes avant de réessayer

### Impossible de compiler bourso-api
```bash
# Mettre à jour Rust
rustup update

# Nettoyer le build
cd bourso-api && cargo clean && cargo build --release
```

## 8. Architecture de la requête

Quand vous cliquez sur "Virement" dans l'UI:

```
1. UI React → apiBourso.transfer(transfer, password)
       ↓
2. Frontend API → POST /api/bourso/transfer
       ↓
3. Server Node.js → performBoursoTransfer()
       ↓
4. Service Bourso → executeBoutsoCli(['transfer', ...])
       ↓
5. CLI Rust → Appel à l'API Boursorama
       ↓
6. Réponse → JSON → DB locale (optionnel)
```

**Note**: Les mots de passe ne sont jamais stockés, juste transmis à chaque requête.

## 9. Fichiers de configuration

```
MyMoney/
├── .env                          # Variables d'environnement
├── server/
│   ├── services/bourso.ts       # Service wrapper CLI
│   ├── routes/bourso.ts         # Routes API Bourso
│   └── index.ts                 # Enregistrement routes
├── src/
│   ├── types-bourso.ts          # Types TypeScript
│   ├── lib/api-bourso.ts        # API client
│   └── components/
│       ├── BoursoTransferModal.tsx
│       ├── BoursoTradeModal.tsx
│       ├── BoursoActionsWidget.tsx
│       └── AccountsTab.tsx       # Intégration UI
└── BOURSO_INTEGRATION.md        # Documentation

bourso-api/
├── src/
│   ├── lib.rs                   # Librairie Rust
│   ├── main.rs                  # CLI Rust
│   └── bourso_api/
│       ├── client/              # HTTP client pour Bourso
│       ├── account.rs           # Modèles de comptes
│       └── ...
├── Cargo.toml
└── target/
    └── release/
        └── bourso-cli           # Binaire exécutable ← utilisé par Node
```

## 10. Support et ressources

- Documentation bourso-api: https://github.com/azerpas/bourso-api
- API Boursorama (non-officielle): Extraite par reverse-engineering
- Issues: Vérifiez les logs du serveur avec `npm run dev`

---

**Vous êtes prêt!** 🚀 Lancez MyMoney et testez l'intégration Bourso.
