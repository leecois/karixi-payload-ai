import type { AIProvider } from '../../types.js'
import { createAnthropicProvider } from './anthropic.js'
import { createGeminiProvider } from './gemini.js'
import { createOllamaProvider } from './ollama.js'
import { createOpenAIProvider } from './openai.js'

export type { AIProvider }

export type ProviderConfig = {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama'
  apiKey: string
  baseUrl?: string
  model?: string
}

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    case 'openai':
      return createOpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    case 'gemini':
      return createGeminiProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    case 'ollama':
      return createOllamaProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
      })
    default: {
      const _exhaustive: never = config.provider
      throw new Error(`Unknown provider: ${String(_exhaustive)}`)
    }
  }
}
