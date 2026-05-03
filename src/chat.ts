import type { AssistantChatRequest, AssistantChatResponse } from './types'

type EndpointChatResponse = Partial<Omit<AssistantChatResponse, 'provider'>>

const explicitChatEndpoint = import.meta.env.VITE_CHAT_ENDPOINT?.trim()
const generationEndpoint = import.meta.env.VITE_IMAGE_GENERATION_ENDPOINT?.trim()

function siblingChatEndpoint(endpoint: string | undefined) {
  if (!endpoint) return ''

  try {
    const url = new URL(endpoint)
    url.pathname = url.pathname.replace(/\/generate\/?$/, '/chat')
    return url.toString()
  } catch {
    return ''
  }
}

const chatEndpoint = explicitChatEndpoint || siblingChatEndpoint(generationEndpoint)

function latestUserPrompt(request: AssistantChatRequest) {
  return request.prompt.trim()
}

function scalarContext(request: AssistantChatRequest) {
  return request.pendingScalarChanges
    .slice(0, 3)
    .map((change) => `${change.label} ${Math.round(change.before)} to ${Math.round(change.after)}`)
    .join(', ')
}

function fallbackChatResponse(request: AssistantChatRequest): AssistantChatResponse {
  const prompt = latestUserPrompt(request).toLowerCase()
  const scalarSummary = scalarContext(request)
  const selectedSegment = request.selectedSegment.label
  const selectedVariant = request.selectedVariant.title

  if (prompt.includes('what should i do next') || prompt.includes('next')) {
    return {
      content: scalarSummary
        ? `Next: commit the staged ${scalarSummary}, then generate a remix so we can compare the score movement against ${selectedVariant}. Current focus is ${selectedSegment}.`
        : `Next: pick one high-leverage segment on ${selectedVariant}, stage a small aesthetic change, then generate a remix for comparison. Current focus is ${selectedSegment}.`,
      activity: 'Thought for 2s >',
      focus: 'Planning next move',
      provider: 'mock',
    }
  }

  if (prompt.includes('compare') || prompt.includes('difference')) {
    return {
      content: `The strongest comparison signal is around ${selectedSegment}. I would inspect score movement first, then decide whether the change is a visual treatment or a prompt-direction change.`,
      activity: 'Compared context >',
      focus: 'Comparing selected context',
      provider: 'mock',
    }
  }

  if (scalarSummary) {
    return {
      content: `Staged: ${scalarSummary}. Use Remix Image to generate the committed image as a new canvas variant while preserving the latest chat context.`,
      activity: 'Worked for 1s >',
      focus: 'Reading staged scalars',
      provider: 'mock',
    }
  }

  return {
    content: `I’m reading this against ${selectedVariant} and the ${selectedSegment} segment. The useful move is to keep the instruction narrow enough that the next remix changes one visible thing we can score.`,
    activity: 'Thought for 1s >',
    focus: 'Reading image context',
    provider: 'mock',
  }
}

function normalizeChatResponse(
  request: AssistantChatRequest,
  response: EndpointChatResponse,
): AssistantChatResponse {
  const fallback = fallbackChatResponse(request)
  const content = response.content?.trim()

  return {
    content: content || fallback.content,
    activity: response.activity?.trim() || 'Worked with model >',
    focus: response.focus?.trim() || 'Composing model response',
    provider: 'endpoint',
  }
}

async function requestEndpointChat(request: AssistantChatRequest) {
  if (!chatEndpoint) return undefined
  if (!explicitChatEndpoint && typeof navigator !== 'undefined' && navigator.webdriver) return undefined

  const response = await fetch(chatEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) return undefined

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as EndpointChatResponse
  }

  return { content: await response.text() } satisfies EndpointChatResponse
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function requestAssistantChat(request: AssistantChatRequest) {
  try {
    const response = await requestEndpointChat(request)
    if (response) {
      return normalizeChatResponse(request, response)
    }
  } catch {
    await wait(420)
    return fallbackChatResponse(request)
  }

  await wait(420)
  return fallbackChatResponse(request)
}
