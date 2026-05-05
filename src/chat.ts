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
    const pathname = url.pathname.replace(/\/+$/, '')
    if (!/\/generate$/i.test(pathname)) return ''

    url.pathname = pathname.replace(/\/generate$/i, '/chat')
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
      const key = segment.label.toLowerCase()
      const current = segmentScores.get(key)
      const score = (current?.score ?? 0) + Math.abs(segment.delta)
      segmentScores.set(key, { segment, score })
    })
  })

  return Array.from(segmentScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.segment)
}

function segmentSignal(variant: CanvasVariantSnapshot) {
  const seenLabels = new Set<string>()
  const signals = [...variant.segments]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .filter((segment) => {
      const key = segment.label.toLowerCase()
      if (seenLabels.has(key)) return false
      seenLabels.add(key)
      return true
    })
    .slice(0, 2)
    .map((segment) => `${segment.label} ${segment.delta >= 0 ? '+' : ''}${segment.delta}`)

  return signals.length ? signals.join(', ') : 'no dominant SAM delta'
}

function fallbackVariantsFromRequest(request: AssistantChatRequest) {
  const prompted = variantsFromPrompt(request)
  const selected = selectedCanvasVariants(request)
  const variants = prompted.length ? prompted : selected.length ? selected : request.canvas?.variants ?? []

  return uniqueVariants(variants).filter(
    (variant) => variant.sourceFidelity?.mode === 'fallback-generation',
  )
}

function fallbackReasonForVariant(variant: CanvasVariantSnapshot) {
  const fidelity = variant.sourceFidelity
  if (!fidelity) return 'I do not have a source-fidelity report for that canvas node.'

  const providerMode = fidelity.providerMode.toLowerCase()
  const reason =
    fidelity.evidence?.fallbackReason ??
    fidelity.warnings[0] ??
    fidelity.notes[0] ??
    fidelity.summary

  if (/safety/.test(providerMode)) {
    return `${reason} In plain language, the edit route was blocked, so the worker used a lower-confidence fallback generation path.`
  }
  if (/endpoint-failed/.test(providerMode)) {
    return `${reason} The endpoint did not return a usable generated image, so the app kept a fallback preview visible.`
  }
  if (/unchanged-output|identical/.test(providerMode) || /identical/i.test(reason)) {
    return `${reason} The output matched the source too closely to count as a generated remix.`
  }
  if ((fidelity.evidence?.imageInputCount ?? 1) < 1) {
    return 'The generation result did not report source image inputs, so it cannot be accepted as a source-preserving edit.'
  }

  return reason
}

function fallbackResolutionForVariant(variant: CanvasVariantSnapshot) {
  const fidelity = variant.sourceFidelity
  if (!fidelity) return 'Retry after generating a fresh source-fidelity report.'

  const providerMode = fidelity.providerMode.toLowerCase()
  const reason = `${fidelity.evidence?.fallbackReason ?? ''} ${fidelity.warnings.join(' ')}`.toLowerCase()

  if (/safety/.test(providerMode) || /safety|policy|blocked|rejected/.test(reason)) {
    return 'Use a safer or less aggressive prompt: reduce extreme slider deltas, preserve face/body/product/type regions, and retry the source-preserving edit route.'
  }
  if (/endpoint-failed/.test(providerMode) || /endpoint|usable image|without returning/.test(reason)) {
    return 'Check the worker/model response and retry. The worker should return an image plus sourceFidelity evidence instead of substituting a preview.'
  }
  if (/unchanged-output|identical/.test(providerMode) || /identical/.test(reason)) {
    return 'Retry with a clearer visible art-direction delta and verify the worker is not returning the original source image as the output.'
  }
  if ((fidelity.evidence?.imageInputCount ?? 1) < 1) {
    return 'Make sure the worker calls the image edit path with the selected source image attached, ideally followed by product and typography references.'
  }

  return 'Retry as a source-preserving edit with stricter product/copy/type locks and run a critic before accepting the remix.'
}

function fallbackStatusResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const prompt = latestUserPrompt(request).toLowerCase()
  if (
    !prompt.includes('fallback') &&
    !(prompt.includes('why') && (prompt.includes('failed') || prompt.includes('generated')))
  ) {
    return null
  }

  const [variant] = fallbackVariantsFromRequest(request)
  if (!variant?.sourceFidelity) return null
  const fidelity = variant.sourceFidelity
  const evidence = fidelity.evidence
  const technicalLine = [
    `providerMode=${fidelity.providerMode}`,
    typeof evidence?.imageInputCount === 'number' ? `imageInputs=${evidence.imageInputCount}` : '',
    evidence?.endpoint ? `endpoint=${evidence.endpoint}` : '',
  ].filter(Boolean).join(' · ')

  return {
    content: [
      `${variant.title} was marked as fallback because ${fallbackReasonForVariant(variant)}`,
      `To resolve it: ${fallbackResolutionForVariant(variant)}`,
      `Technical signal: ${technicalLine || fidelity.summary}.`,
    ].join('\n\n'),
    activity: 'Checked fallback trace >',
    focus: 'Reading source-fidelity report',
    provider: 'mock',
  }
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
    context.includes('adult') ||
    context.includes('people') ||
    context.includes('figures') ||
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

function segmentIdsFromPrompt(request: AssistantChatRequest) {
  const prompt = latestUserPrompt(request).toLowerCase()
  const segments = request.selectedVariant.segments?.length
    ? request.selectedVariant.segments
    : request.selectedSegments
  const matches = segments.filter((segment) => {
    const label = `${segment.id} ${segment.label}`.toLowerCase()
    return (
      prompt.includes(segment.id.toLowerCase()) ||
      label
        .split(/\s+/)
        .filter((token) => token.length > 3)
        .some((token) => prompt.includes(token))
    )
  })

  if (matches.length) return matches.map((segment) => segment.id)
  if (prompt.includes('face') || prompt.includes('person') || prompt.includes('emotion')) {
    const emotionSegments = segments
      .filter((segment) => /emotion|face|person|human/i.test(`${segment.id} ${segment.label}`))
      .map((segment) => segment.id)
    return emotionSegments.length ? emotionSegments : ['emotion']
  }
  if (prompt.includes('product') || prompt.includes('package')) return ['product']
  if (prompt.includes('cta') || prompt.includes('button')) return ['cta']
  if (prompt.includes('copy') || prompt.includes('headline') || prompt.includes('text')) return ['resonance']
  return request.selectedSegments.map((segment) => segment.id).slice(0, 2)
}

function segmentNamesForIds(request: AssistantChatRequest, segmentIds: string[]) {
  const segments = request.selectedVariant.segments?.length
    ? request.selectedVariant.segments
    : request.selectedSegments

  return segmentIds
    .map((id) => segments.find((segment) => segment.id === id)?.label ?? id)
    .filter((label, index, list) => list.indexOf(label) === index)
}

function selectSegmentResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const prompt = latestUserPrompt(request).toLowerCase()
  if (
    !prompt.includes('focus') &&
    !prompt.includes('select') &&
    !prompt.includes('segment') &&
    !prompt.includes('look at')
  ) {
    return null
  }

  const segmentIds = segmentIdsFromPrompt(request).filter(Boolean)
  if (!segmentIds.length) return null

  return {
    content: `I focused ${segmentNamesForIds(request, segmentIds).join(', ')} so the canvas and next prompt use that segment context.`,
    activity: 'Focused segment >',
    focus: 'Selecting segment context',
    provider: 'mock',
    actions: [{ type: 'select-segment', segmentIds }],
  }
}

function blendResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const prompt = latestUserPrompt(request).toLowerCase()
  if (!prompt.includes('blend') && !prompt.includes('merge') && !prompt.includes('combine images')) {
    return null
  }

  const [source, target] = comparisonCandidates(request)
  if (!source || !target) return null

  return {
    content: `I’ll blend ${source.title} with ${target.title} as a new canvas remix, using the current photographic controls and chat context.`,
    activity: 'Queued image blend >',
    focus: 'Blending selected canvas images',
    provider: 'mock',
    actions: [{ type: 'blend-variants', sourceId: source.id, targetId: target.id }],
  }
}

function generateResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const prompt = latestUserPrompt(request).toLowerCase()
  if (
    !prompt.includes('generate') &&
    !prompt.includes('remix') &&
    !prompt.includes('make a new image') &&
    !prompt.includes('create a variant')
  ) {
    return null
  }

  const [source] = variantsFromPrompt(request)
  const sourceVariant = source ?? request.selectedVariant
  const segmentIds = segmentIdsFromPrompt(request)

  return {
    content: `I’ll generate a new remix from ${sourceVariant.title}, carrying over the staged controls, selected segment context, and this chat direction.`,
    activity: 'Queued remix >',
    focus: 'Starting image generation',
    provider: 'mock',
    actions: [
      {
        type: 'generate-remix',
        sourceVariantId: sourceVariant.id,
        segmentIds,
        promptHint: request.prompt,
      },
    ],
  }
}

function segmentApplyResponse(request: AssistantChatRequest): AssistantChatResponse | null {
  const prompt = latestUserPrompt(request)
  const lower = prompt.toLowerCase()
  if (!lower.includes('clicked apply') && !lower.includes('segment direction')) return null

  const direction =
    prompt.match(/direction "([^"]+)"/i)?.[1] ??
    prompt.match(/Apply[^"]*"([^"]+)"/i)?.[1] ??
    'this direction'
  const segment =
    prompt.match(/for ([^\n.]+?) on /i)?.[1] ??
    request.selectedSegment.label
  const scalarSummary = scalarContext(request)

  return {
    content: [
      `I’ll apply ${direction} to ${segment} and generate a new remix from ${request.selectedVariant.title}.`,
      scalarSummary
        ? `I’m moving the aesthetic controls around ${scalarSummary}, then translating that into a focused image prompt rather than treating the flyout label as the whole prompt.`
        : 'I’m translating the segment direction into a focused image prompt while preserving the product, copy, typography, and source frame.',
    ].join(' '),
    activity: 'Planned segment edit >',
    focus: 'Planning segment direction',
    provider: 'mock',
  }
}

function fallbackChatResponse(request: AssistantChatRequest): AssistantChatResponse {
  const prompt = latestUserPrompt(request).toLowerCase()
  const scalarSummary = scalarContext(request)
  const selectedSegment = request.selectedSegment.label
  const selectedVariant = request.selectedVariant.title
  const fallbackResponse = fallbackStatusResponse(request)
  if (fallbackResponse) return fallbackResponse

  const segmentApply = segmentApplyResponse(request)
  if (segmentApply) return segmentApply

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

  if (prompt.includes('blend') || prompt.includes('merge') || prompt.includes('combine images')) {
    const response = blendResponse(request)
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

  if (
    prompt.includes('generate') ||
    prompt.includes('remix') ||
    prompt.includes('make a new image') ||
    prompt.includes('create a variant')
  ) {
    const response = generateResponse(request)
    if (response) return response
  }

  if (prompt.includes('focus') || prompt.includes('select') || prompt.includes('segment')) {
    const response = selectSegmentResponse(request)
    if (response) return response
  }

  if (scalarSummary) {
    return {
      content: `I’ll translate that direction into the controls: ${scalarSummary}. The next remix will use those staged changes with the current image, selected segment, and recent chat context preserved.`,
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
