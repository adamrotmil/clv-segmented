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
  'Emotional engagement: visible people, faces, bodies, expression, gaze, or gesture',
  'Creative resonance: brand wordmark, headline, copy, typography, or core visual idea',
  'Product placement: advertised product package, label, bottle, pack, or SKU',
  'CTA: call-to-action text or button',
  'Use tight boxes around visible content only',
  'Do not cover empty space with a foreground segment',
]

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function clampSegment(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundSegmentValue(value: number) {
  return Number(value.toFixed(1))
}

const fallbackSuggestions = {
  emotion: [
    {
      id: 'human-hook',
      label: 'Make faces the hook',
      impact: 6,
      promptHint:
        'make the existing people or faces the emotional hook while preserving the source product and typography',
      responseHint:
        'I’ll make the human read carry more of the image, then keep the product and type locked.',
      rationale: 'Use when the segment contains people, faces, bodies, or emotional posture.',
      scalarAdjustments: { presence: 12, staging: 7, gaze: 6, valence: 6 },
    },
    {
      id: 'warmer-moment',
      label: 'Warm the moment',
      impact: 4,
      promptHint:
        'shift the selected human moment toward warmer emotional tone, softer expression, and more inviting atmosphere',
      responseHint:
        'I’ll warm the emotional tone and soften the read without turning it into a posed portrait.',
      rationale: 'Use when the segment has people but the mood feels cool or distant.',
      scalarAdjustments: { valence: 9, key: 5, chromatics: 4, hardness: -5 },
    },
    {
      id: 'candid-gesture',
      label: 'Find a candid gesture',
      impact: 4,
      promptHint:
        'make the selected human area feel more candid through natural gesture, relaxed timing, and source-supported body language',
      responseHint:
        'I’ll lean into candid staging so the people feel observed rather than arranged.',
      rationale: 'Use when the segment needs a more natural lifestyle read.',
      scalarAdjustments: { staging: 10, arousal: -4, presence: 5 },
    },
  ],
  resonance: [
    {
      id: 'brand-hierarchy',
      label: 'Clarify brand hierarchy',
      impact: 4,
      promptHint:
        'make the brand typography area more intentional, legible, and compositionally resolved without changing the copy',
      responseHint:
        'I’ll protect the copy and tighten the visual hierarchy around the brand read.',
      rationale: 'Use when the headline, wordmark, or copy area feels weak.',
      scalarAdjustments: { complexity: -5, balance: 7, 'stopping-power': 7 },
    },
    {
      id: 'graphic-read',
      label: 'Simplify the graphic read',
      impact: 4,
      promptHint:
        'simplify the area around the brand/copy into a clearer graphic composition with stronger negative space',
      responseHint:
        'I’ll use cleaner negative space and a simpler graphic read so the brand lands faster.',
      rationale: 'Use when the visual idea feels busy around the copy.',
      scalarAdjustments: { abstraction: 8, complexity: -9, balance: 6 },
    },
    {
      id: 'type-contrast',
      label: 'Improve type contrast',
      impact: 3,
      promptHint:
        'improve contrast and separation around visible copy while preserving exact text, font logic, and placement',
      responseHint:
        'I’ll improve the type contrast while keeping the text system intact.',
      rationale: 'Use when copy is present but competing with the image.',
      scalarAdjustments: { hardness: 6, key: -3, complexity: -5 },
    },
  ],
  product: [
    {
      id: 'product-hero',
      label: 'Make product the hero',
      impact: 5,
      promptHint:
        'make the advertised product package more dominant, crisp, and shoppable while preserving exact SKU, label, shape, and placement logic',
      responseHint:
        'I’ll use product clarity and scale as the main move, with the package identity locked.',
      rationale: 'Use when the product is present but not commanding enough.',
      scalarAdjustments: { groundedness: 6, 'stopping-power': 10, depth: 5, complexity: -4 },
    },
    {
      id: 'label-legibility',
      label: 'Sharpen label read',
      impact: 4,
      promptHint:
        'increase product label legibility, glass/material clarity, and edge definition without inventing new packaging',
      responseHint:
        'I’ll sharpen the label and material cues so the product reads cleanly at feed size.',
      rationale: 'Use when product markings are soft or partly lost.',
      scalarAdjustments: { hardness: 8, key: 4, materiality: 5, abstraction: -5 },
    },
    {
      id: 'premium-material',
      label: 'Elevate material cues',
      impact: 3,
      promptHint:
        'make product materials feel more premium through controlled reflections, tactile surface cues, and clean light',
      responseHint:
        'I’ll make the product materials feel more premium without changing the object.',
      rationale: 'Use when the package needs more tactile luxury.',
      scalarAdjustments: { materiality: 10, hardness: 4, chromatics: 3 },
    },
  ],
  cta: [
    {
      id: 'cta-clarity',
      label: 'Increase CTA clarity',
      impact: 3,
      promptHint:
        'make the CTA more legible and better separated while preserving exact wording and placement logic',
      responseHint:
        'I’ll improve the CTA read without turning it into a UI element or changing the copy.',
      rationale: 'Use when the CTA is visible but too subtle.',
      scalarAdjustments: { complexity: -6, 'stopping-power': 7, balance: 4 },
    },
    {
      id: 'cta-breathing-room',
      label: 'Give CTA breathing room',
      impact: 2,
      promptHint:
        'increase clean negative space around the CTA and reduce nearby visual interference while preserving source typography',
      responseHint:
        'I’ll give the CTA cleaner breathing room while leaving the ad typography native.',
      rationale: 'Use when CTA placement is crowded.',
      scalarAdjustments: { complexity: -8, balance: 5, abstraction: 3 },
    },
    {
      id: 'cta-feed-read',
      label: 'Make CTA feed-readable',
      impact: 3,
      promptHint:
        'make the CTA readable at social-feed size through clean contrast, hierarchy, and protected safe-frame placement',
      responseHint:
        'I’ll optimize the CTA for feed-size readability while keeping the exact words.',
      rationale: 'Use when the CTA disappears at canvas scale.',
      scalarAdjustments: { 'stopping-power': 8, hardness: 4, key: -2 },
    },
  ],
} satisfies Record<string, SegmentAnnotation['suggestions']>

const segmentLabels = {
  emotion: 'Emotional engagement',
  resonance: 'Creative resonance',
  product: 'Product placement',
  cta: 'CTA',
} as const

function canonicalSegmentId(segment: Pick<SegmentAnnotation, 'id' | 'label'>) {
  const value = `${segment.id} ${segment.label}`.toLowerCase()
  if (/\b(product|package|bottle|sku|label|packshot)\b/.test(value)) return 'product'
  if (/\b(cta|button|shop|learn|buy|call.to.action)\b/.test(value)) return 'cta'
  if (/\b(copy|headline|wordmark|brand|typography|text|logo|resonance)\b/.test(value)) {
    return 'resonance'
  }
  if (/\b(face|person|people|human|body|expression|emotion|portrait|model|gesture)\b/.test(value)) {
    return 'emotion'
  }
  return segment.id || 'segment'
}

function suggestionsForSegment(segment: SegmentAnnotation) {
  const canonicalId = canonicalSegmentId(segment)
  const fallback = fallbackSuggestions[canonicalId as keyof typeof fallbackSuggestions] ?? fallbackSuggestions.resonance
  const suggestions = segment.suggestions?.length ? segment.suggestions : fallback

  return suggestions.map((suggestion, index) => {
    const fallbackSuggestion = fallback[index % fallback.length]
    return {
      ...fallbackSuggestion,
      ...suggestion,
      id: suggestion.id || fallbackSuggestion.id,
      label: suggestion.label || fallbackSuggestion.label,
      promptHint: suggestion.promptHint || fallbackSuggestion.promptHint,
      responseHint: suggestion.responseHint || fallbackSuggestion.responseHint,
      rationale: suggestion.rationale || fallbackSuggestion.rationale,
      scalarAdjustments: suggestion.scalarAdjustments || fallbackSuggestion.scalarAdjustments,
    }
  })
}

function normalizeSegment(
  segment: SegmentAnnotation,
  index: number,
  source: SegmentAnnotation['source'],
  labelSource: SegmentAnnotation['labelSource'],
): SegmentAnnotation {
  const width = clampSegment(segment.width, 4, 98)
  const height = clampSegment(segment.height, 4, 98)
  const shouldCanonicalize = source !== 'manual'
  const canonicalId = shouldCanonicalize ? canonicalSegmentId(segment) : segment.id || `segment-${index + 1}`
  const canonicalLabel =
    shouldCanonicalize && canonicalId in segmentLabels
      ? segmentLabels[canonicalId as keyof typeof segmentLabels]
      : segment.label

  const normalized = {
    ...segment,
    id: canonicalId,
    label: canonicalLabel,
    x: roundSegmentValue(clampSegment(segment.x, 0, 100 - width)),
    y: roundSegmentValue(clampSegment(segment.y, 0, 100 - height)),
    width: roundSegmentValue(width),
    height: roundSegmentValue(height),
    source: segment.source ?? source,
    labelSource: segment.labelSource ?? labelSource,
  }

  return {
    ...normalized,
    suggestions: suggestionsForSegment(normalized),
  }
}

function mergeSegmentGroup(segments: SegmentAnnotation[], index: number) {
  const [first] = segments
  const minX = Math.min(...segments.map((segment) => segment.x))
  const minY = Math.min(...segments.map((segment) => segment.y))
  const maxX = Math.max(...segments.map((segment) => segment.x + segment.width))
  const maxY = Math.max(...segments.map((segment) => segment.y + segment.height))
  const confidenceValues = segments
    .map((segment) => segment.confidence)
    .filter((value): value is number => typeof value === 'number')
  const mergedSuggestions = segments.flatMap((segment) => segment.suggestions ?? [])
  const seenSuggestionIds = new Set<string>()

  return normalizeSegment(
    {
      ...first,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      delta: Math.max(...segments.map((segment) => segment.delta ?? 0)),
      confidence: confidenceValues.length
        ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
        : first.confidence,
      suggestions: mergedSuggestions.filter((suggestion) => {
        if (seenSuggestionIds.has(suggestion.id)) return false
        seenSuggestionIds.add(suggestion.id)
        return true
      }),
      mask: undefined,
    },
    index,
    first.source ?? 'vision',
    first.labelSource ?? 'vision',
  )
}

function mergeDuplicateSegments(segments: SegmentAnnotation[]) {
  const groups = new Map<string, SegmentAnnotation[]>()
  segments.forEach((segment) => {
    const key = canonicalSegmentId(segment)
    groups.set(key, [...(groups.get(key) ?? []), segment])
  })

  return Array.from(groups.values()).map((group, index) =>
    group.length === 1 ? group[0] : mergeSegmentGroup(group, index),
  )
}

export function projectSegmentsForRequest(request: CreativeGenerationRequest): SegmentAnnotation[] {
  const sourceSegments = request.sourceVariant.segments?.length
    ? request.sourceVariant.segments
    : [request.selectedSegment]

  const projectedSegments = sourceSegments.map((segment, index) => {
    const selectedBoost = segment.id === request.selectedSegment.id
    const sizeShift = selectedBoost ? 0.8 : 0
    const width = clampSegment(segment.width + sizeShift, 10, 88)
    const height = clampSegment(segment.height + sizeShift * 0.55, 8, 42)

    return normalizeSegment(
      {
        ...segment,
        x: clampSegment(segment.x, 2, 98 - width),
        y: clampSegment(segment.y, 2, 98 - height),
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

  return mergeDuplicateSegments(projectedSegments)
}

export function projectSegmentsForImage(
  _variantId: string,
  _imageUrl: string,
  sourceSegments: SegmentAnnotation[],
  mediaSize?: MediaSize,
): SegmentAnnotation[] {
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

  const projectedSegments = segments.map((segment, index) =>
    normalizeSegment(
      {
        ...segment,
        confidence: undefined,
        mask: undefined,
      },
      index,
      'projected',
      'heuristic',
    ),
  )

  return mergeDuplicateSegments(projectedSegments)
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
  const sourceSummary = generationRequest?.sourceVariant.visualContext?.summary
  const assetName = generationRequest?.asset.name
  const contextHints = generationRequest
    ? [
        'Return tight boxes around visible pixels only; do not highlight empty sky or blank background unless the segment is explicitly background.',
        'Merge related face/body/person regions into one Emotional engagement box when they belong to the same human moment.',
        'Creative resonance should tightly cover the brand/copy/wordmark area, not the full sky.',
        'CTA should tightly cover the call-to-action text or button only.',
        'Product placement should tightly cover the advertised product package only.',
        selectedLabel ? `Current focus: ${selectedLabel}` : '',
        assetName ? `Asset: ${assetName}` : '',
        sourceSummary ? `Source read: ${sourceSummary}` : '',
      ]
    : [
        title ?? '',
        'Return tight boxes around visible pixels only.',
        'Emotional engagement: visible people, faces, bodies, expression, or gesture.',
        'Creative resonance: brand wordmark, headline, typography, or core visual idea.',
        'Product placement: advertised product package.',
        'CTA: call-to-action text or button.',
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
      assetName,
      sourceSummary,
      analysisInstructions: [
        'Analyze the actual image pixels before returning boxes.',
        'Use percentages relative to the provided image width and height.',
        'Boxes should be tight to the object/text/human content they name.',
        'Do not place boxes over empty space just because a source box used to be there.',
        'If the layout changed from the source, locate the new visible position instead of projecting old coordinates.',
        'Return creative suggestions per segment as different art-direction moves, including promptHint and scalarAdjustments when possible.',
      ],
      desiredSegments: [
        {
          id: 'emotion',
          label: 'Emotional engagement',
          target: 'visible people, faces, bodies, expression, gaze, gesture, or emotional human moment',
        },
        {
          id: 'resonance',
          label: 'Creative resonance',
          target: 'brand wordmark, headline, typography stack, campaign copy, or core visual idea area',
        },
        {
          id: 'product',
          label: 'Product placement',
          target: 'the advertised product package and visible label/packaging only',
        },
        {
          id: 'cta',
          label: 'CTA',
          target: 'call-to-action text or button only',
        },
      ],
    },
  }
}

function normalizeEndpointResult(
  request: SegmentImageRequest,
  result: EndpointSegmentImageResult,
): SegmentImageResult | undefined {
  if (!result.segments?.length) return undefined
  const normalizedSegments = result.segments.map((segment, index) =>
    normalizeSegment(segment, index, 'vision', 'vision'),
  )

  return {
    variantId: result.variantId ?? request.variantId,
    segments: mergeDuplicateSegments(normalizedSegments),
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
