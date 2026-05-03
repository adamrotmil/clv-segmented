import type {
  CreativeGenerationRequest,
  CreativeGenerationResult,
  SegmentAnnotation,
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

function segmentSeed(request: CreativeGenerationRequest) {
  return Array.from(`${request.id}-${request.intent}-${request.outputTitle}`).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  )
}

function clampSegment(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundSegmentValue(value: number) {
  return Number(value.toFixed(1))
}

export function projectSegmentsForRequest(request: CreativeGenerationRequest): SegmentAnnotation[] {
  const sourceSegments = request.sourceVariant.segments?.length
    ? request.sourceVariant.segments
    : [request.selectedSegment]
  const seed = segmentSeed(request)
  const intentShift =
    request.intent === 'image-blend'
      ? 2.4
      : request.intent === 'segment-edit'
        ? 1.8
        : request.intent === 'idea-combine'
          ? 1.5
          : 1.2

  return sourceSegments.map((segment, index) => {
    const signal = ((seed + index * 17) % 9) - 4
    const selectedBoost = segment.id === request.selectedSegment.id
    const dx = signal * 0.55 * intentShift
    const dy = (((seed + index * 11) % 7) - 3) * 0.48 * intentShift
    const sizeShift = selectedBoost ? 1.5 : ((seed + index * 5) % 3) - 1
    const width = clampSegment(segment.width + sizeShift, 10, 88)
    const height = clampSegment(segment.height + sizeShift * 0.55, 8, 42)

    return {
      ...segment,
      x: roundSegmentValue(clampSegment(segment.x + dx, 2, 98 - width)),
      y: roundSegmentValue(clampSegment(segment.y + dy, 2, 98 - height)),
      width: roundSegmentValue(width),
      height: roundSegmentValue(height),
      delta: selectedBoost
        ? segment.delta + Math.max(1, Math.round(request.scoreLift))
        : segment.delta,
    }
  })
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
    ...request.latestTrace.ingredients,
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
    segments: result.segments ?? projectSegmentsForRequest(request),
    provider,
    promptSummary: result.promptSummary ?? promptSummaryFor(request),
  }
}

async function requestEndpointGeneration(request: CreativeGenerationRequest) {
  if (!generationEndpoint) return undefined
  if (typeof navigator !== 'undefined' && navigator.webdriver) return undefined

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
