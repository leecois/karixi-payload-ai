'use client'

export type AISettingsProps = {
  provider: string
  apiKeyConfigured: boolean
  features: { adminUI: boolean; devTools: boolean }
}

export function AISettings({ provider, apiKeyConfigured, features }: AISettingsProps) {
  return (
    <div style={{ padding: '24px', maxWidth: '600px' }}>
      <h2 style={{ marginBottom: '16px' }}>AI Plugin Settings</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px', fontWeight: 'bold' }}>Provider</td>
            <td style={{ padding: '8px' }}>{provider}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px', fontWeight: 'bold' }}>API Key</td>
            <td style={{ padding: '8px' }}>{apiKeyConfigured ? 'Configured' : 'Not configured'}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px', fontWeight: 'bold' }}>Admin UI</td>
            <td style={{ padding: '8px' }}>{features.adminUI ? 'Enabled' : 'Disabled'}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', fontWeight: 'bold' }}>Dev Tools</td>
            <td style={{ padding: '8px' }}>{features.devTools ? 'Enabled' : 'Disabled'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
