import type {
  CreativeGenerationRequest,
  SegmentAnnotation,
  SegmentImageRequest,
  SegmentImageResult,
} from './types'

type EndpointSegmentImageResult = Partial<Omit<SegmentImageResult, 'provider'>>
type MediaSize = {
  width: number
  height: number
}

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

const fallbackSuggestions = {
  emotion: [
    { id: 'presence', label: 'Improve human presence', impact: 4 },
    { id: 'gaze', label: 'Clarify subject focus', impact: 3 },
  ],
  resonance: [
    { id: 'hierarchy', label: 'Clarify brand hierarchy', impact: 4 },
    { id: 'contrast', label: 'Increase contrast', impact: 3 },
  ],
  product: [
    { id: 'product-lock', label: 'Preserve product identity', impact: 5 },
    { id: 'visibility', label: 'Improve product visibility', impact: 3 },
  ],
  cta: [
    { id: 'cta-clarity', label: 'Increase CTA clarity', impact: 3 },
    { id: 'spacing', label: 'Improve CTA spacing', impact: 2 },
  ],
} satisfies Record<string, SegmentAnnotation['suggestions']>

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
  mediaSize?: MediaSize,
): SegmentAnnotation[] {
  const seed = segmentSeed(`${variantId}-${imageUrl}`)
  const segments = sourceSegments.length ? sourceSegments : []

  if (!segments.length) {
    const aspectRatio = mediaSize?.width && mediaSize.height ? mediaSize.width / mediaSize.height : 1
    const isPortrait = aspectRatio < 0.72
    const isLandscape = aspectRatio > 1.35
    const projectedSegments: SegmentAnnotation[] = isPortrait
      ? [
          {
            id: 'resonance',
            label: 'Creative resonance',
            x: 26,
            y: 10,
            width: 48,
            height: 13,
            delta: 3,
            suggestions: fallbackSuggestions.resonance,
          },
          {
            id: 'cta',
            label: 'CTA',
            x: 42,
            y: 21,
            width: 18,
            height: 5,
            delta: 0,
            suggestions: fallbackSuggestions.cta,
          },
          {
            id: 'emotion',
            label: 'Emotional engagement',
            x: 5,
            y: 27,
            width: 76,
            height: 43,
            delta: 4,
            suggestions: fallbackSuggestions.emotion,
          },
          {
            id: 'product',
            label: 'Product placement',
            x: 61,
            y: 73,
            width: 30,
            height: 18,
            delta: 4,
            suggestions: fallbackSuggestions.product,
          },
        ]
      : isLandscape
        ? [
            {
              id: 'emotion',
              label: 'Emotional engagement',
              x: 10,
              y: 18,
              width: 36,
              height: 50,
              delta: 4,
              suggestions: fallbackSuggestions.emotion,
            },
            {
              id: 'resonance',
              label: 'Creative resonance',
              x: 50,
              y: 16,
              width: 38,
              height: 30,
              delta: 3,
              suggestions: fallbackSuggestions.resonance,
            },
            {
              id: 'product',
              label: 'Product placement',
              x: 55,
              y: 54,
              width: 28,
              height: 28,
              delta: 4,
              suggestions: fallbackSuggestions.product,
            },
            {
              id: 'cta',
              label: 'CTA',
              x: 62,
              y: 84,
              width: 22,
              height: 8,
              delta: 0,
              suggestions: fallbackSuggestions.cta,
            },
          ]
        : [
            {
              id: 'emotion',
              label: 'Emotional engagement',
              x: 34,
              y: 10,
              width: 30,
              height: 25,
              delta: 4,
              suggestions: fallbackSuggestions.emotion,
            },
            {
              id: 'resonance',
              label: 'Creative resonance',
              x: 8,
              y: 34,
              width: 76,
              height: 28,
              delta: 3,
              suggestions: fallbackSuggestions.resonance,
            },
            {
              id: 'product',
              label: 'Product placement',
              x: 38,
              y: 63,
              width: 30,
              height: 20,
              delta: 4,
              suggestions: fallbackSuggestions.product,
            },
            {
              id: 'cta',
              label: 'CTA',
              x: 5,
              y: 86,
              width: 44,
              height: 10,
              delta: 0,
              suggestions: fallbackSuggestions.cta,
            },
          ]

    return projectedSegments.map((segment, index) =>
      normalizeSegment(segment, index, 'projected', 'heuristic'),
    )
  }

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
  mediaSize,
  generationRequest,
  title,
  sourceVariantId,
}: {
  variantId: string
  imageUrl: string
  mediaSize?: MediaSize
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
    : [
        title ?? '',
        'brand headline',
        'product package',
        'people',
        'CTA',
        'source aspect ratio',
      ]

  return {
    variantId,
    requestId: generationRequest?.id,
    imageUrl,
    imageWidth: mediaSize?.width ?? generationRequest?.sourceVariant.mediaSize?.width ?? 1024,
    imageHeight: mediaSize?.height ?? generationRequest?.sourceVariant.mediaSize?.height ?? 1024,
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
    segments: projectSegmentsForImage(request.variantId, request.imageUrl, sourceSegments, {
      width: request.imageWidth,
      height: request.imageHeight,
    }),
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
