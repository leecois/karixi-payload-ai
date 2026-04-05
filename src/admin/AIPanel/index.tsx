'use client'

import { useState } from 'react'

export type AIPanelProps = {
  collections: Array<{ slug: string; label: string; populatable: boolean }>
}

export function AIPanel({ collections }: AIPanelProps) {
  const populatable = collections.filter((c) => c.populatable)
  const [selectedCollection, setSelectedCollection] = useState('')
  const [count, setCount] = useState(10)
  const [theme, setTheme] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!selectedCollection) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/ai/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: selectedCollection, count, theme }),
      })
      if (!response.ok) throw new Error(`Failed: ${response.statusText}`)
      const data = (await response.json()) as { created: number; message: string }
      setResult(`Successfully created ${data.created} documents`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px' }}>
      <h2 style={{ marginBottom: '16px' }}>AI Bulk Generate</h2>

      <div style={{ marginBottom: '12px' }}>
        <label
          htmlFor="ai-panel-collection"
          style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}
        >
          Collection
        </label>
        <select
          id="ai-panel-collection"
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        >
          <option value="">Select collection...</option>
          {populatable.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label || c.slug}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label
          htmlFor="ai-panel-count"
          style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}
        >
          Count
        </label>
        <input
          id="ai-panel-count"
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="ai-panel-theme"
          style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}
        >
          Theme / Context
        </label>
        <input
          id="ai-panel-theme"
          type="text"
          value={theme}
          placeholder="e.g., luxury sneakers, organic food..."
          onChange={(e) => setTheme(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !selectedCollection}
        style={{
          padding: '10px 24px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: loading ? 'wait' : 'pointer',
          border: 'none',
          borderRadius: '4px',
          background: loading ? '#ccc' : '#333',
          color: '#fff',
        }}
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {result && <p style={{ color: 'green', marginTop: '12px' }}>{result}</p>}
      {error && <p style={{ color: 'red', marginTop: '12px' }}>{error}</p>}
    </div>
  )
}
