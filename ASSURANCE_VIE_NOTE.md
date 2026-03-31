# Note : Assurance-Vie Bourso

## Situation

**Crédit Étudiant** ✅ a été correctement importé via l'API Bourso lors de la dernière synchronisation

**Crédit Étudiant** - MAINTENANT CATÉGORISÉ CORRECTEMENT ✅
- ✅ Importé comme "lending" (kind: 'debt')
- ✅ Prochaine sync aura manualBalance: -30686 et kind: 'debt'
- ✅ Apparaîtra dans la section "Dettes" de l'application

**Assurance-Vie** ❌ ne peut PAS être importée automatiquement car Boursorama n'expose pas les assurances-vie via son API web publique utilisée par `bourso-cli`

## Explication technique

1. **L'API Bourso (bourso-cli)** récupère les comptes depuis: `https://clients.boursobank.com/dashboard/liste-comptes`
2. Cette page retourne HTML avec sections pour:
   - ✅ Comptes bancaires (`data-summary-bank`)
   - ✅ Épargne (`data-summary-savings`)
   - ✅ Placements (`data-summary-trading`)
   - ✅ Crédits (`data-summary-loan`)
   - ❌ Assurances-vie (**ABSENT**)

3. Enquête menée:
   - Testé patterns: `data-summary-assurance`, `data-summary-aol`, `data-summary-vie`
   - Résultat: Aucun pattern ne fonctionne (n'existe pas dans le HTML)
   - Conclusion: Boursorama ne liste pas les assurances-vie dans ce dashboard

## Solution : Import manuel CSV

L'application MyMoney supporte l'import CSV pour les assurances-vie.

**Format attendu** (voir le fichier `export-positions-assurance-vie-*.csv`):
```csv
"valeur";"Date de valeur";quantité;"Prix revient";Cours;Montant;"+/- latentes";"+/- %"
"AMUNDI S&P 500 II UCITS ETF D";2026-03-24;6.4188;54,14;58,32;374,31;+26,79;+7,71
```

**Procédure d'import:**
1. Exporter manuellement depuis Bourso > Section Assurance-Vie > Exporter
2. Ouvrir MyMoney > Onglet "Imports"
3. Glisser-déposer le CSV ou cliquer "Importer"
4. Sélectionner "assurance-vie" comme type de compte
5. Valider le mapping des colonnes
6. L'assurance-vie sera ajoutée aux comptes

## Actions prises

### Backend TypeScript (Node.js)
- ✅ Modifié la synchronisation pour récupérer les positions d'assurance-vie IF elles existent
- ✅ Renommé et clarifié les fonctions de l'API

### API Rust (bourso-cli)
- ✅ Ajouté le type `AccountKind::LifeInsurance`
- ✅ Modifié les vérifications pour accepter LifeInsurance
- ✅ Ajouté le pattern HTML (bien que Bourso ne l'utilise pas)
- ✅ Compilé avec succès

### Conclusion
Le code est **prêt** pour supporter les assurances-vie si Boursorama les exposait via son API. En l'attente, l'import CSV reste la meilleure solution.
