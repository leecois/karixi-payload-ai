import type { AIProvider } from '../../types.js'

/**
 * OpenAI-compatible provider for local LLM servers.
 * Works with: Ollama, LocalAI, vLLM, LM Studio, and any
 * server exposing an OpenAI-compatible /v1/chat/completions endpoint.
 */

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatResponse = {
  choices: Array<{
    message: { role: string; content: string | null }
  }>
}

function isChatResponse(value: unknown): value is ChatResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'choices' in value &&
    Array.isArray((value as ChatResponse).choices)
  )
}

function detectMediaType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

export type OllamaProviderConfig = {
  baseUrl?: string
  model?: string
  apiKey?: string
}

export function createOllamaProvider(config: OllamaProviderConfig): AIProvider {
  const baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '')
  const model = config.model ?? 'llama3.3:8b'
  const apiKey = config.apiKey ?? 'ollama'

  async function callAPI(messages: ChatMessage[], jsonMode: boolean): Promise<ChatResponse> {
    const body: Record<string, unknown> = { model, messages }
    if (jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error ${response.status}: ${errorText}`)
    }

    const data: unknown = await response.json()
    if (!isChatResponse(data)) {
      throw new Error('Unexpected API response shape from local LLM server')
    }
    return data
  }

  return {
    async generate(prompt: string, _outputSchema: Record<string, unknown>): Promise<unknown[]> {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a data generation assistant. Always respond with valid JSON only. When asked for an array, wrap it in {"items": [...]} so json_object mode is satisfied.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nRespond with JSON object {"items": [...]} where items is the array of generated documents.`,
        },
      ]

      const data = await callAPI(messages, true)
      const choice = data.choices[0]
      if (!choice || choice.message.content === null) {
        throw new Error('No content in response from local LLM server')
      }

      const parsed: unknown = JSON.parse(choice.message.content)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'items' in parsed &&
        Array.isArray((parsed as { items: unknown }).items)
      ) {
        return (parsed as { items: unknown[] }).items
      }
      if (Array.isArray(parsed)) {
        return parsed
      }
      throw new Error('Local LLM response is not a JSON array')
    },

    async analyzeImage(imageBuffer: Buffer): Promise<string> {
      const base64 = imageBuffer.toString('base64')
      const mediaType = detectMediaType(imageBuffer)
      const dataUrl = `data:${mediaType};base64,${base64}`

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            {
              type: 'text',
              text: 'Describe this image concisely for use as alt text. Focus on the main subject and important visual details. Respond with only the alt text description, no extra explanation.',
            },
          ],
        },
      ]

      const data = await callAPI(messages, false)
      const choice = data.choices[0]
      if (!choice || choice.message.content === null) {
        throw new Error('No content in image analysis response from local LLM server')
      }
      return (choice.message.content as string).trim()
    },
  }
}
