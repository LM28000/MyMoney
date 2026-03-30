# MyMoney AI MVP

Prototype local de gestion de budget alimenté par des exports bancaires CSV.

## Ce que fait déjà le MVP

- importe un export bancaire au format BoursoBank
- précharge l'export fourni dans le workspace
- isole les virements pour ne pas biaiser le budget de vie
- détecte les lignes non catégorisées
- calcule un tableau de bord mensuel
- met en avant les catégories et commerçants dominants
- génère des signaux "assistant IA" à partir des transactions

## Ce que fait maintenant la V2 locale

- budgets éditables par catégorie avec sauvegarde locale
- règles de recatégorisation persistées dans le navigateur
- assistant de questions/réponses sur les dépenses du mois
- recherche libre dans les transactions mensuelles
- détection des dépenses récurrentes
- détection d'anomalies de montant
- premier module patrimoine avec actifs et dettes manuels
- calcul de valeur nette à partir du cash importé et des postes saisis

## Lancer le projet

```bash
npm install
npm run dev
```

## Lancer le mode full-stack

```bash
# 1) copie la conf backend
cp .env.example .env

# 2) lance API + frontend ensemble
npm run dev:full
```

Le frontend utilise automatiquement `/api` et parle au backend Express sur `http://localhost:8787`.

## Configuration IA (LMStudio / OpenAI-compatible)

Le backend expose `/api/ai/ask` et peut appeler n'importe quelle API compatible OpenAI.

Variables `.env`:

- `OPENAI_BASE_URL` (exemple LMStudio: `http://localhost:1234/v1`)
- `OPENAI_API_KEY` (pour LMStudio: une valeur arbitraire, ex `lm-studio`)
- `OPENAI_MODEL` (nom du modèle chargé dans LMStudio)

Si ces variables ne sont pas définies, l'assistant retombe automatiquement sur un mode local (heuristique).

## Backend API

Endpoints principaux:

- `GET /api/state` (état complet persistant)
- `POST /api/import` (import CSV et persistance)
- `PUT /api/rules` (règles de recatégorisation)
- `PUT /api/budgets` (budgets personnalisés)
- `PUT /api/networth-items` (actifs et dettes manuels)
- `GET /api/patrimony/summary` (synthèse patrimoine)
- `POST /api/ai/ask` (question assistant IA)

## Build de production

```bash
npm run build
```

## Prochaines étapes produit

- règles de recatégorisation persistées
- budgets éditables par enveloppe
- moteur de patrimoine multi-comptes
- vraie couche IA conversationnelle branchée sur les données normalisées

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
