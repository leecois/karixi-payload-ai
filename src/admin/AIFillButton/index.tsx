'use client'

import { useState } from 'react'

export type AIFillButtonProps = {
  fieldName: string
  collectionSlug: string
  path: string
  label?: string
}

export function AIFillButton({
  fieldName,
  collectionSlug,
  path,
  label = 'AI Fill',
}: AIFillButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/generate-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldName, collectionSlug, path }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? `Request failed: ${res.status}`)
      }

      const data = (await res.json()) as { value: unknown }

      window.dispatchEvent(new CustomEvent('ai-fill', { detail: { path, value: data.value } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: '4px 10px',
          fontSize: '12px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          background: '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        {loading ? 'Generating...' : label}
      </button>
      {error && <span style={{ fontSize: '11px', color: '#ef4444' }}>{error}</span>}
    </div>
  )
}
