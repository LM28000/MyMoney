# 🔧 Debugging - Intégration Boursorama

## État actuel

L'intégration Boursorama a été implémentée avec:
- ✅ Routes API Bourso `/api/bourso/*`
- ✅ Composants React (modales + widget)
- ✅ Types TypeScript
- ✅ Build TypeScript sans erreurs
- ✅ Deux serveurs configurés (API sur 8787, Frontend sur 5174/5175)

## Problème rapporté

Les boutons "💸 Virement" et "📈 Trading" ne semblent pas répondre aux clics.

## Diagnostic implémenté

Des `console.log()` et `alert()` ont été ajoutés pour tracer:
1. Click sur les boutons → `alert()` s'affiche
2. State `showBoursoTransfer` se met à jour → modale s'ouvre
3. Logs détaillés dans modales quand elles se montent

## Étapes de test (À FAIRE)

### 1. Démarrer les deux serveurs
```bash
# Terminal 1: Backend API
cd /Users/Louis-Marie\ PERRET\ DU\ CRAY/Documents/MyMoney
npm run api:dev

# Terminal 2: Frontend (autre terminal)
cd /Users/Louis-Marie\ PERRET\ DU\ CRAY/Documents/MyMoney
npm run dev
```

### 2. Naviguer et tester
1. Ouvrir http://localhost:5174 (ou 5175/5173 si ports occupés)
2. Aller à l'onglet "Comptes & Investissements"
3. **Cliquer sur le bouton "💸 Virement"**
4. Vérifier que:
   - ✅ Un `alert()` apparaît avec "Virement button clicked!"
   - ✅ Une modale s'ouvre (fond noir semi-transparent + formulaire)

### 3. Si alert() n'apparaît pas
- Les boutons ne sont pas cliquables (problème CSS)
- Vérifier dans l'inspecteur: l'élément est-il pointer-events: none?
- Vérifier si un autre élément recouvre les boutons

### 4. Si alert() apparaît mais modale ne s'ouvre pas
- Ouvrir console (Cmd+Option+I)
- Chercher les logs `[BoursoTransferModal]`
- Si log ne s'affiche pas: state `showBoursoTransfer` ne se met pas à jour
- Si log s'affiche avec `isOpen: false`: state n'a pas changé

### 5. Vérifier les requêtes API
- Onglet "Network" de l'inspecteur
- Cliquer sur "Sync comptes" dans le widget et vérifier:
  - Requête `POST /api/bourso/accounts/sync`
  - Réponse 200 avec `{ accounts: [], action: {...} }`

## Points de débogage supplémentaires

**Backend logs** - Regarder le terminal `npm run api:dev`:
```
Si modale s'ouvre mais erreur:
[error] Failed to sync accounts: ...
```

**Frontend console** - Cmd+Option+I, Console:
```
[BoursoTransferModal] isOpen: true accounts count: X
```

## Solutions possibles

| Symptôme | Solution |
|----------|----------|
| Buttons non cliquables | Vérifier CSS, z-index |
| Alert n'apparaît pas | Buttons masqués ou overflow |
| Modale n'apparaît pas | State pas mis à jour, vérifier logs |
| Modale apparaît vide | Pas de comptes dans la liste, c'est normal |
| Erreur API | Vérifier `/api` proxy dans vite.config.ts |

## Architecture de débogage déployée

```
User clicks button
  ↓ alert() + console.log()
  ↓ setShowBoursoTransfer(true)
  ↓ Re-render AccountsTab
  ↓ <BoursoTransferModal isOpen={true} />
  ↓ console.log('[BoursoTransferModal] isOpen: true')
  ↓ Modal renders
```

Chaque étape est loggée pour isoler le problème.

## Point de contact

Si le problème persiste même après ces tests:
1. Rafraîchir le navigateur (Cmd+R)
2. Vérifier que `npm run api:dev` tourne
3. Vérifier que `npm run dev` tourne
4. S'assurer qu'aucune extension navigateur interfère
5. Ouvrir les Chrome DevTools et coller les logs complets

---

**Created**: 2026-03-31
**Status**: Awaiting user testing phase
