import type { AIProvider } from '../../types.js'

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{
    content: { parts: Array<{ text?: string }>; role: string }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
  promptFeedback?: { blockReason?: string }
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  return typeof value === 'object' && value !== null && 'candidates' in value
}

function detectMediaType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif'
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

function extractText(response: GeminiResponse): string {
  if (!response.candidates || response.candidates.length === 0) {
    const reason = response.promptFeedback?.blockReason ?? 'unknown'
    throw new Error(`Gemini request blocked: ${reason}`)
  }

  const candidate = response.candidates[0]
  const text = candidate.content.parts.find((p) => 'text' in p)?.text
  if (!text) {
    throw new Error('No text content in Gemini response')
  }

  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response truncated (MAX_TOKENS) — output may be incomplete')
  }

  return text.trim()
}

export type GeminiProviderConfig = {
  apiKey: string
  model?: string
  baseUrl?: string
}

export function createGeminiProvider(config: GeminiProviderConfig): AIProvider {
  const model = config.model ?? 'gemini-2.5-flash'
  const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'

  async function callAPI(
    contents: GeminiContent[],
    systemInstruction?: string,
    jsonMode?: boolean,
  ): Promise<GeminiResponse> {
    const body: Record<string, unknown> = { contents }

    if (systemInstruction) {
      body.system_instruction = { parts: [{ text: systemInstruction }] }
    }

    if (jsonMode) {
      body.generationConfig = {
        responseMimeType: 'application/json',
      }
    }

    const url = `${baseUrl}/models/${model}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': config.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errorText}`)
    }

    const data: unknown = await response.json()
    if (!isGeminiResponse(data)) {
      throw new Error('Unexpected Gemini API response shape')
    }
    return data
  }

  return {
    async generate(prompt: string, _outputSchema: Record<string, unknown>): Promise<unknown[]> {
      const contents: GeminiContent[] = [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\n\nRespond with ONLY a valid JSON array. No markdown, no explanation, just the JSON array.`,
            },
          ],
        },
      ]

      const data = await callAPI(
        contents,
        'You are a data generation assistant. Always respond with valid JSON arrays only.',
        true,
      )

      const text = extractText(data)
      const jsonText = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()

      const parsed: unknown = JSON.parse(jsonText)
      if (Array.isArray(parsed)) {
        return parsed
      }
      if (typeof parsed === 'object' && parsed !== null && 'items' in parsed) {
        const items = (parsed as { items: unknown }).items
        if (Array.isArray(items)) return items
      }
      throw new Error('Gemini response is not a JSON array')
    },

    async analyzeImage(imageBuffer: Buffer): Promise<string> {
      const base64 = imageBuffer.toString('base64')
      const mimeType = detectMediaType(imageBuffer)

      const contents: GeminiContent[] = [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            {
              text: 'Describe this image concisely for use as alt text. Focus on the main subject and important visual details. Respond with only the alt text description, no extra explanation.',
            },
          ],
        },
      ]

      const data = await callAPI(contents)
      return extractText(data)
    },
  }
}
