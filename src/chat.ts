import type {
  AssistantChatRequest,
  AssistantChatResponse,
  CanvasThemeGroup,
  CanvasVariantSnapshot,
  SegmentAnnotation,
} from './types'

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

function remixNumberFromTitle(title: string) {
  const match = /^Remix\s+(\d+)$/i.exec(title.trim())
  return match ? Number(match[1]) : 0
}

function uniqueVariants(variants: CanvasVariantSnapshot[]) {
  return variants.filter(
    (variant, index, list) => list.findIndex((item) => item.id === variant.id) === index,
  )
}

function requestedVariantNumbers(prompt: string) {
  const numbers = new Set<number>()
  for (const match of prompt.matchAll(/\b(?:version|variant|remix)\s*(\d+)\b/g)) {
    numbers.add(Number(match[1]))
  }

  const paired = prompt.match(
    /\b(?:version|variant|remix)\s*(\d+)\s*(?:,|and|or|vs|versus)\s*(\d+)\b/,
  )
  if (paired) {
    numbers.add(Number(paired[1]))
    numbers.add(Number(paired[2]))
  }

  return Array.from(numbers).filter((number) => Number.isFinite(number) && number > 0)
}

function variantsFromPrompt(request: AssistantChatRequest) {
  const prompt = latestUserPrompt(request).toLowerCase()
  const variants = request.canvas?.variants?.length
    ? request.canvas.variants
    : [
        {
          ...request.selectedVariant,
          imageUrl: request.selectedVariant.image,
          segments: request.selectedVariant.segments ?? [],
        },
      ]
  const matches: CanvasVariantSnapshot[] = []

  if (prompt.includes('original') || prompt.includes('baseline')) {
    const original = variants.find((variant) => variant.kind === 'original' || variant.id === 'original')
    if (original) matches.push(original)
  }

  requestedVariantNumbers(prompt).forEach((number) => {
    const exactRemix =
      variants.find((variant) => remixNumberFromTitle(variant.title) === number) ??
      variants.find((variant) => variant.title.toLowerCase().includes(`version ${number}`))
    if (exactRemix) matches.push(exactRemix)
  })

  variants.forEach((variant) => {
    const title = variant.title.toLowerCase()
    if (prompt.includes(title)) matches.push(variant)
  })

  return uniqueVariants(matches)
}

function selectedCanvasVariants(request: AssistantChatRequest) {
  const ids = [
    ...(request.canvas?.selectedVariantIds ?? []),
    ...(request.canvas?.comparisonIds ?? []),
    request.selectedVariant.id,
  ].filter(Boolean)
  const variants = request.canvas?.variants ?? []

  return uniqueVariants(ids.map((id) => variants.find((variant) => variant.id === id)).filter(Boolean) as CanvasVariantSnapshot[])
}

function comparisonCandidates(request: AssistantChatRequest) {
  const prompted = variantsFromPrompt(request)
  if (prompted.length >= 2) return prompted.slice(0, 4)

  const selected = selectedCanvasVariants(request)
  if (selected.length >= 2) return selected.slice(0, 4)

  const remixes = (request.canvas?.variants ?? [])
    .filter((variant) => variant.id !== 'original')
    .sort((a, b) => remixNumberFromTitle(a.title) - remixNumberFromTitle(b.title))

  return remixes.slice(0, 2)
}

function topSegments(variants: CanvasVariantSnapshot[], limit = 3) {
  const segmentScores = new Map<string, { segment: SegmentAnnotation; score: number }>()

  variants.forEach((variant) => {
    variant.segments.forEach((segment) => {
      const current = segmentScores.get(segment.id)
      const score = (current?.score ?? 0) + Math.abs(segment.delta)
      segmentScores.set(segment.id, { segment, score })
    })
  })

  return Array.from(segmentScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.segment)
}

function segmentSignal(variant: CanvasVariantSnapshot) {
  const signals = [...variant.segments]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2)
    .map((segment) => `${segment.label} ${segment.delta >= 0 ? '+' : ''}${segment.delta}`)

  return signals.length ? signals.join(', ') : 'no dominant SAM delta'
}

function compareResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const variants = comparisonCandidates(request)
  if (variants.length < 2) return null

  const [anchor, challenger] = variants
  const best = variants.reduce((winner, variant) => (variant.score > winner.score ? variant : winner), anchor)
  const runnerUp = best.id === anchor.id ? challenger : anchor
  const segmentIds = topSegments(variants).map((segment) => segment.id)
  const segmentNames = topSegments(variants)
    .map((segment) => segment.label)
    .join(', ')

  return {
    content: `I’d choose ${best.title} over ${runnerUp.title}. It has ES ${best.score}% versus ${runnerUp.score}%, and the SAM read is stronger around ${segmentNames || 'the selected segments'}. ${best.title} shows ${segmentSignal(best)}; ${runnerUp.title} is useful as a reference, but it carries less predicted engagement signal in this comparison.`,
    activity: 'Compared canvas >',
    focus: 'Comparing selected variants',
    provider: 'mock',
    actions: [
      {
        type: 'compare-variants',
        variantIds: variants.map((variant) => variant.id),
        anchorId: best.id,
        segmentIds,
      },
    ],
  }
}

function themeLabelForVariant(variant: CanvasVariantSnapshot) {
  if (variant.id === 'original' || variant.kind === 'original') return 'Baseline'

  const context = [
    variant.title,
    variant.visualSummary ?? '',
    ...(variant.ingredients ?? []),
    ...(variant.sourceIds ?? []),
  ]
    .join(' ')
    .toLowerCase()

  if (context.includes('blend') || context.includes('combined')) return 'Blended directions'
  if (context.includes('abstract') || context.includes('surreal') || context.includes('texture')) {
    return 'Abstract / stylized'
  }
  if (
    context.includes('candid') ||
    context.includes('face') ||
    context.includes('human') ||
    context.includes('emotional') ||
    context.includes('staging')
  ) {
    return 'Human-forward'
  }
  if (context.includes('product') || context.includes('cta') || context.includes('resonance')) {
    return 'Conversion clarity'
  }
  return variant.score >= 84 ? 'High-signal remixes' : 'Source-preserving'
}

function themeGroups(variants: CanvasVariantSnapshot[]): CanvasThemeGroup[] {
  const groups = new Map<string, CanvasThemeGroup>()

  variants.forEach((variant) => {
    const label = themeLabelForVariant(variant)
    const group = groups.get(label) ?? {
      label,
      variantIds: [],
      rationale: label === 'Baseline' ? 'Locked source of truth.' : 'Grouped from visual read, provenance, and score signal.',
    }
    group.variantIds.push(variant.id)
    groups.set(label, group)
  })

  return Array.from(groups.values())
}

function arrangeResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const variants = request.canvas?.variants ?? []
  if (variants.length < 2) return null

  const groups = themeGroups(variants)
  const selectedIds = groups.flatMap((group) => group.variantIds).slice(0, 4)

  return {
    content: `I grouped the canvas into ${groups.map((group) => group.label).join(', ')}. The layout keeps Original Image as the baseline, then clusters remixes by visual treatment and SAM/scoring context so the comparison surface is easier to scan.`,
    activity: 'Rearranged canvas >',
    focus: 'Grouping variants by theme',
    provider: 'mock',
    actions: [
      {
        type: 'arrange-canvas',
        layout: 'themes',
        groups,
        selectedIds,
      },
    ],
  }
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

  if (
    prompt.includes('group') ||
    prompt.includes('organize') ||
    prompt.includes('cluster') ||
    prompt.includes('rearrange')
  ) {
    const response = arrangeResponse(request)
    if (response) return response
  }

  if (
    prompt.includes('compare') ||
    prompt.includes('difference') ||
    prompt.includes('vs') ||
    prompt.includes('better') ||
    prompt.includes('prefer') ||
    prompt.includes('like')
  ) {
    const response = compareResponse(request)
    if (response) return response
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
  const actions = response.actions?.length ? response.actions : fallback.actions

  return {
    content: content || fallback.content,
    activity: response.activity?.trim() || 'Worked with model >',
    focus: response.focus?.trim() || 'Composing model response',
    provider: 'endpoint',
    actions,
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
