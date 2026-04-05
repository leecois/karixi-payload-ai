import type { AIProvider } from '../../types.js'
import { createAnthropicProvider } from './anthropic.js'
import { createGeminiProvider } from './gemini.js'
import { createOllamaProvider } from './ollama.js'
import { createOpenAIProvider } from './openai.js'
import { createOpenRouterProvider } from './openrouter.js'

export type { AIProvider }

export type ProviderConfig = {
  provider: 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama'
  apiKey: string
  baseUrl?: string
  model?: string
  siteUrl?: string
  siteName?: string
}

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config.apiKey)
    case 'openai':
      return createOpenAIProvider(config.apiKey)
    case 'gemini':
      return createGeminiProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    case 'openrouter':
      return createOpenRouterProvider({
        apiKey: config.apiKey,
        model: config.model,
        siteUrl: config.siteUrl,
        siteName: config.siteName,
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
