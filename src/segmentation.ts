import type {
  CreativeGenerationRequest,
  SegmentAnnotation,
  SegmentImageRequest,
  SegmentImageResult,
} from './types'

type EndpointSegmentImageResult = Partial<Omit<SegmentImageResult, 'provider'>>

const generationEndpoint = import.meta.env.VITE_IMAGE_GENERATION_ENDPOINT?.trim()
const explicitSegmentationEndpoint = import.meta.env.VITE_IMAGE_SEGMENTATION_ENDPOINT?.trim()
const segmentationEndpoint =
  explicitSegmentationEndpoint ||
  (generationEndpoint?.endsWith('/generate')
    ? generationEndpoint.replace(/\/generate$/, '/segment')
    : '')

export const defaultSemanticHints = [
  'face',
  'headline copy',
  'product',
  'CTA',
  'body',
  'background',
]

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function segmentSeed(value: string) {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)
}

function clampSegment(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundSegmentValue(value: number) {
  return Number(value.toFixed(1))
}

function normalizeSegment(
  segment: SegmentAnnotation,
  index: number,
  source: SegmentAnnotation['source'],
  labelSource: SegmentAnnotation['labelSource'],
): SegmentAnnotation {
  const width = clampSegment(segment.width, 4, 98)
  const height = clampSegment(segment.height, 4, 98)

  return {
    ...segment,
    id: segment.id || `segment-${index + 1}`,
    x: roundSegmentValue(clampSegment(segment.x, 0, 100 - width)),
    y: roundSegmentValue(clampSegment(segment.y, 0, 100 - height)),
    width: roundSegmentValue(width),
    height: roundSegmentValue(height),
    source: segment.source ?? source,
    labelSource: segment.labelSource ?? labelSource,
  }
}

export function projectSegmentsForRequest(
  request: CreativeGenerationRequest,
  imageUrl = request.fallbackImage,
): SegmentAnnotation[] {
  const sourceSegments = request.sourceVariant.segments?.length
    ? request.sourceVariant.segments
    : [request.selectedSegment]
  const seed = segmentSeed(`${request.id}-${request.intent}-${request.outputTitle}-${imageUrl}`)
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

    return normalizeSegment(
      {
        ...segment,
        x: clampSegment(segment.x + dx, 2, 98 - width),
        y: clampSegment(segment.y + dy, 2, 98 - height),
        width,
        height,
        delta: selectedBoost
          ? segment.delta + Math.max(1, Math.round(request.scoreLift))
          : segment.delta,
        confidence: undefined,
        mask: undefined,
      },
      index,
      'projected',
      'heuristic',
    )
  })
}

export function projectSegmentsForImage(
  variantId: string,
  imageUrl: string,
  sourceSegments: SegmentAnnotation[],
): SegmentAnnotation[] {
  const seed = segmentSeed(`${variantId}-${imageUrl}`)
  const segments = sourceSegments.length ? sourceSegments : []

  return segments.map((segment, index) => {
    const signal = ((seed + index * 23) % 11) - 5
    const width = clampSegment(segment.width + (((seed + index * 7) % 3) - 1), 10, 88)
    const height = clampSegment(segment.height + (((seed + index * 5) % 3) - 1), 8, 42)

    return normalizeSegment(
      {
        ...segment,
        x: clampSegment(segment.x + signal * 0.7, 2, 98 - width),
        y: clampSegment(segment.y + (((seed + index * 13) % 9) - 4) * 0.6, 2, 98 - height),
        width,
        height,
        confidence: undefined,
        mask: undefined,
      },
      index,
      'projected',
      'heuristic',
    )
  })
}

export function buildSegmentImageRequest({
  variantId,
  imageUrl,
  generationRequest,
  title,
  sourceVariantId,
}: {
  variantId: string
  imageUrl: string
  generationRequest?: CreativeGenerationRequest
  title?: string
  sourceVariantId?: string
}): SegmentImageRequest {
  const selectedLabel = generationRequest?.selectedSegment.label
  const contextHints = generationRequest
    ? [
        selectedLabel ?? '',
        ...generationRequest.imagePrompt.context.map((item) => item.value),
      ]
    : []

  return {
    variantId,
    requestId: generationRequest?.id,
    imageUrl,
    imageWidth: 1024,
    imageHeight: 1024,
    semanticHints: uniqueItems([...defaultSemanticHints, ...contextHints]).slice(0, 12),
    context: {
      title: title ?? generationRequest?.outputTitle,
      sourceVariantId: sourceVariantId ?? generationRequest?.sourceVariant.id,
      generationIntent: generationRequest?.intent,
      selectedSegmentLabel: selectedLabel,
    },
  }
}

function normalizeEndpointResult(
  request: SegmentImageRequest,
  result: EndpointSegmentImageResult,
): SegmentImageResult | undefined {
  if (!result.segments?.length) return undefined

  return {
    variantId: result.variantId ?? request.variantId,
    segments: result.segments.map((segment, index) =>
      normalizeSegment(segment, index, 'sam', 'vision'),
    ),
    provider: 'endpoint',
    toolName: result.toolName ?? 'sam.segment-anything',
    semanticHints: result.semanticHints ?? request.semanticHints,
    rawPayload: result.rawPayload ?? result,
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function requestEndpointSegmentation(request: SegmentImageRequest) {
  if (!segmentationEndpoint) return undefined
  if (typeof navigator !== 'undefined' && navigator.webdriver) return undefined

  const response = await fetch(segmentationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) return undefined

  const result = (await response.json()) as EndpointSegmentImageResult
  return normalizeEndpointResult(request, result)
}

async function simulateSegmentation(
  request: SegmentImageRequest,
  sourceSegments: SegmentAnnotation[],
) {
  await wait(420)

  return {
    variantId: request.variantId,
    segments: projectSegmentsForImage(request.variantId, request.imageUrl, sourceSegments),
    provider: 'mock',
    toolName: 'projected-fallback',
    semanticHints: request.semanticHints,
    rawPayload: {
      reason: 'No segmentation endpoint returned masks; using projected boxes as an explicit fallback.',
      source: 'projected',
      imageUrl: request.imageUrl,
      semanticHints: request.semanticHints,
    },
  } satisfies SegmentImageResult
}

export async function requestImageSegmentation(
  request: SegmentImageRequest,
  sourceSegments: SegmentAnnotation[],
): Promise<SegmentImageResult> {
  try {
    const endpointResult = await requestEndpointSegmentation(request)
    if (endpointResult) return endpointResult
  } catch {
    return simulateSegmentation(request, sourceSegments)
  }

  return simulateSegmentation(request, sourceSegments)
}
