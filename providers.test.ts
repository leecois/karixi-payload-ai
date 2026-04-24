import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicProvider } from './src/core/providers/anthropic.js'
import { createOpenAIProvider } from './src/core/providers/openai.js'

const originalFetch = globalThis.fetch

type FetchCall = { url: string; init?: RequestInit }
function mockFetch(response: unknown, status = 200) {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => 'stub',
      json: async () => response,
    } as unknown as Response
  }) as unknown as typeof fetch
  return calls
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('createAnthropicProvider — model override honored', () => {
  it('defaults to claude-sonnet-4-20250514 when no model specified', async () => {
    const calls = mockFetch({
      content: [{ type: 'text', text: '[{"x":1}]' }],
    })
    const provider = createAnthropicProvider('test-key')
    await provider.generate('prompt', {})
    expect(calls).toHaveLength(1)
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.model).toBe('claude-sonnet-4-20250514')
  })

  it('uses the model from config when provided', async () => {
    const calls = mockFetch({
      content: [{ type: 'text', text: '[{"x":1}]' }],
    })
    const provider = createAnthropicProvider({
      apiKey: 'test',
      model: 'claude-opus-4-20250514',
    })
    await provider.generate('prompt', {})
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.model).toBe('claude-opus-4-20250514')
  })

  it('respects baseUrl override (for self-hosted/proxy setups)', async () => {
    const calls = mockFetch({
      content: [{ type: 'text', text: '[]' }],
    })
    const provider = createAnthropicProvider({
      apiKey: 't',
      baseUrl: 'https://proxy.example.com',
    })
    await provider.generate('prompt', {})
    expect(calls[0].url).toBe('https://proxy.example.com/v1/messages')
  })

  it('string argument form preserved for backwards compatibility', () => {
    expect(() => createAnthropicProvider('legacy-key')).not.toThrow()
  })
})

describe('createOpenAIProvider — model override honored', () => {
  it('defaults to gpt-4o', async () => {
    const calls = mockFetch({
      choices: [{ message: { role: 'assistant', content: '{"items":[]}' } }],
    })
    const provider = createOpenAIProvider('test')
    await provider.generate('prompt', {})
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.model).toBe('gpt-4o')
  })

  it('uses the model from config when provided', async () => {
    const calls = mockFetch({
      choices: [{ message: { role: 'assistant', content: '{"items":[]}' } }],
    })
    const provider = createOpenAIProvider({ apiKey: 't', model: 'gpt-5' })
    await provider.generate('prompt', {})
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.model).toBe('gpt-5')
  })

  it('respects baseUrl override', async () => {
    const calls = mockFetch({
      choices: [{ message: { role: 'assistant', content: '{"items":[]}' } }],
    })
    const provider = createOpenAIProvider({
      apiKey: 't',
      baseUrl: 'https://openrouter-proxy.example.com',
    })
    await provider.generate('prompt', {})
    expect(calls[0].url).toBe('https://openrouter-proxy.example.com/v1/chat/completions')
  })
})
