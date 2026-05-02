import type {
  CreativeGenerationRequest,
  CreativeGenerationResult,
} from './types'

type EndpointGenerationResult = Partial<Omit<CreativeGenerationResult, 'requestId' | 'provider'>>

const generationEndpoint = import.meta.env.VITE_IMAGE_GENERATION_ENDPOINT?.trim()

function uniqueItems(items: string[]) {
  return Array.from(
    new Set(items.map((item) => item.trim()).filter(Boolean)),
  )
}

function lastUserInstruction(request: CreativeGenerationRequest) {
  return [...request.chatContext].reverse().find((message) => message.role === 'user')?.content
}

function promptSummaryFor(request: CreativeGenerationRequest) {
  const scalarSummary = request.scalarChanges
    .map((change) => `${change.label} ${Math.round(change.before)}→${Math.round(change.after)}`)
    .join(', ')
  const chatInstruction = lastUserInstruction(request)
  const segment = request.selectedSegment.label

  return uniqueItems([
    scalarSummary ? `Aesthetic scalars: ${scalarSummary}` : '',
    `Segment: ${segment}`,
    chatInstruction ? `Chat: ${chatInstruction}` : '',
    request.latestTrace.what,
  ]).join(' | ')
}

function normalizeGenerationResult(
  request: CreativeGenerationRequest,
  result: EndpointGenerationResult,
  provider: CreativeGenerationResult['provider'],
): CreativeGenerationResult {
  const scalarIngredients = request.scalarChanges.map((change) => change.label)
  const chatInstruction = lastUserInstruction(request)
  const ingredients = uniqueItems([
    ...(result.ingredients ?? []),
    ...scalarIngredients.slice(0, 2),
    chatInstruction ? 'Chat direction' : '',
    request.selectedSegment.label,
  ]).slice(0, 4)
  const projectedScore = Math.min(96, request.projectedScore + request.scoreLift)

  return {
    requestId: request.id,
    title: result.title ?? request.outputTitle,
    image: result.image ?? request.fallbackImage,
    score: result.score ?? projectedScore,
    delta: result.delta ?? Math.max(1, projectedScore - request.sourceVariant.score),
    filter: result.filter ?? request.baseFilter,
    ingredients,
    sourceIds: result.sourceIds ?? request.sourceIds,
    provider,
    promptSummary: result.promptSummary ?? promptSummaryFor(request),
  }
}

async function requestEndpointGeneration(request: CreativeGenerationRequest) {
  if (!generationEndpoint) return undefined

  const response = await fetch(generationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) return undefined

  return (await response.json()) as EndpointGenerationResult
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function simulateGeneration(request: CreativeGenerationRequest) {
  await wait(680)
  const intentFilter =
    request.intent === 'segment-edit'
      ? 'brightness(1.02)'
      : request.intent === 'idea-combine'
        ? 'contrast(1.05)'
        : 'contrast(1.04)'

  return normalizeGenerationResult(
    request,
    {
      filter: `${request.baseFilter} ${intentFilter}`,
      promptSummary: promptSummaryFor(request),
    },
    'mock',
  )
}

export async function requestCreativeGeneration(request: CreativeGenerationRequest) {
  try {
    const endpointResult = await requestEndpointGeneration(request)
    if (endpointResult) {
      return normalizeGenerationResult(request, endpointResult, 'endpoint')
    }
  } catch {
    return simulateGeneration(request)
  }

  return simulateGeneration(request)
}
