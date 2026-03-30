import { useState } from 'react'
import type { ProductType } from './AccountsTab'

type Props = {
  fileName: string
  csvText: string
  productType: ProductType
  onConfirm: (mappedCsvText: string) => void
  onCancel: () => void
}

// Future: mapping expected columns based on account type
// const ACCOUNT_COLUMNS: Record<ProductType, string[]> = {
//   checking: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   'livret-a': ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   'livret-jeune': ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   lep: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   ldds: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   'livret-other': ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   pea: ['name/ISIN', 'ISIN', 'quantity', 'buyingPrice', 'lastPrice', 'amount'],
//   'pea-pme': ['name/ISIN', 'ISIN', 'quantity', 'buyingPrice', 'lastPrice', 'amount'],
//   'assurance-vie': ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   per: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   cto: ['name/ISIN', 'ISIN', 'quantity', 'buyingPrice', 'lastPrice', 'amount'],
//   crypto: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   'real-estate': ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
//   other: ['Date', 'Date de valeur', 'Débit', 'Crédit', 'Libellé', 'Solde'],
// }


export default function CsvMappingDialog({
  fileName,
  csvText,
  productType,
  onConfirm,
  onCancel,
}: Props) {
  const lines = csvText.split('\n').filter((l) => l.trim())
  const headerLine = lines[0]
  const headers = headerLine
    .split(';')
    .map((h) => h.replace(/^"(.*)"$/, '$1').trim())

  const [mapping, setMapping] = useState<Record<number, number>>({})
  const [confirming, setConfirming] = useState(false)

  // const expectedCols = ACCOUNT_COLUMNS[productType] || [] // For future client-side remapping

  // Preview: show first 2 data rows
  const previewRows = lines.slice(1, 3)

  const handleMappingChange = (headerIdx: number, value: string) => {
    const colIdx = Number(value)
    if (colIdx >= 0) {
      setMapping((m) => ({ ...m, [headerIdx]: colIdx }))
    } else {
      setMapping((m) => {
        const next = { ...m }
        delete next[headerIdx]
        return next
      })
    }
  }

  const handleConfirm = async () => {
    // For now, just send the unmapped CSV - the server will handle it
    // A future enhancement could remap columns client-side before sending
    setConfirming(true)
    try {
      onConfirm(csvText)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="csv-mapping-overlay">
      <div className="csv-mapping-dialog">
        <div className="csv-mapping-header">
          <h3>Importer {fileName}</h3>
          <button className="csv-mapping-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="csv-mapping-body">
          <div className="csv-mapping-info">
            <p>
              <strong>Type de compte:</strong> {productType}
            </p>
            <p>
              <strong>Colonnes détectées:</strong> {headers.length}
            </p>
          </div>

          {/* Detected headers */}
          <div className="csv-mapping-section">
            <h4>Colonnes du fichier</h4>
            <div className="csv-headers-list">
              {headers.map((header, idx) => (
                <div key={idx} className="csv-header-row">
                  <div className="csv-header-label">{header}</div>
                  <select
                    className="csv-header-map"
                    onChange={(e) => handleMappingChange(idx, e.target.value)}
                    defaultValue={mapping[idx] ?? ''}
                  >
                    <option value="">← ignorer</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        Colonne {i + 1}: {h.substring(0, 20)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="csv-mapping-section">
              <h4>Aperçu des données</h4>
              <div className="csv-preview-table">
                <div className="csv-preview-row csv-preview-header">
                  {headers.map((h, i) => (
                    <div key={i} className="csv-preview-cell">
                      {h.substring(0, 15)}
                    </div>
                  ))}
                </div>
                {previewRows.map((row, rIdx) => (
                  <div key={rIdx} className="csv-preview-row">
                    {row
                      .split(';')
                      .map((cell, cIdx) => (
                        <div key={cIdx} className="csv-preview-cell">
                          {cell
                            .replace(/^"(.*)"$/, '$1')
                            .trim()
                            .substring(0, 15)}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="csv-mapping-hint">
            ℹ️ Si vos colonnes semblent mal détectées, vous pouvez les ignorer et le serveur
            essaiera de les reconnaître automatiquement.
          </p>
        </div>

        <div className="csv-mapping-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={confirming}>
            Annuler
          </button>
          <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
            {confirming ? 'Importation…' : '✅ Importer'}
          </button>
        </div>
      </div>
    </div>
  )
}
