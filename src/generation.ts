import type {
  CreativeGenerationRequest,
  CreativeGenerationResult,
  PromptRecipe,
} from './types'

type EndpointGenerationResult = Partial<Omit<CreativeGenerationResult, 'requestId' | 'provider'>> & {
  finalPrompt?: string
  negativePrompt?: string
  visualRead?: string
  composerModel?: string
  observability?: PromptRecipe['observability']
}

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
  if (request.imagePrompt?.promptDraft) return request.imagePrompt.promptDraft

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

function mockPromptRecipeFor(request: CreativeGenerationRequest): PromptRecipe {
  const contextValue = (label: string) =>
    request.imagePrompt.context.find((item) => item.label === label)?.value ?? ''

  return {
    visualRead:
      request.sourceVariant.visualContext?.summary ??
      `Vision read would inspect ${request.sourceVariant.title} and selected image inputs.`,
    finalPrompt: request.imagePrompt.promptDraft || request.imagePrompt.prompt,
    negativePrompt: request.imagePrompt.negativePrompt,
    composedAt: new Date().toISOString(),
    model: `${request.promptComposer.composerModel}-mock`,
    preservationLocks: {
      product: contextValue('Product identity lock'),
      copy: contextValue('Copywriting'),
      typography: contextValue('Typography brand lock'),
    },
    sliderInterpretation: request.scalars.map((scalar) => ({
      id: scalar.id,
      label: scalar.label,
      value: scalar.value,
      instruction:
        request.promptComposer.systemHints.find((hint) =>
          hint.toLowerCase().includes(scalar.label.toLowerCase()),
        ) ?? `${scalar.label} interpreted from ${scalar.value}/100 for prompt composition.`,
    })),
    observability: [
      {
        lane: 'vision',
        text: `Mock composer read source image ${request.sourceVariant.title}; endpoint composer can replace this with a multimodal visual read.`,
      },
      {
        lane: 'prompt',
        text: 'Mock composer promoted the frontend prompt draft into the final prompt because no server composer response was available.',
      },
      {
        lane: 'image',
        text: `Final prompt is ready for ${request.model}.`,
      },
    ],
    debug: {
      requestScaffold: request.imagePrompt.requestScaffold,
      promptComposerRequest: request.promptComposer,
    },
  }
}

function promptRecipeFromEndpoint(
  request: CreativeGenerationRequest,
  result: EndpointGenerationResult,
): PromptRecipe {
  if (result.promptRecipe) return result.promptRecipe

  const fallbackRecipe = mockPromptRecipeFor(request)

  if (!result.finalPrompt && !result.negativePrompt && !result.visualRead) return fallbackRecipe

  return {
    ...fallbackRecipe,
    visualRead: result.visualRead ?? fallbackRecipe.visualRead,
    finalPrompt: result.finalPrompt ?? fallbackRecipe.finalPrompt,
    negativePrompt: result.negativePrompt ?? fallbackRecipe.negativePrompt,
    model: result.composerModel ?? fallbackRecipe.model,
    observability: result.observability ?? fallbackRecipe.observability,
  }
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
  const promptRecipe = promptRecipeFromEndpoint(request, result)

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
    promptSummary: result.promptSummary ?? promptRecipe.finalPrompt ?? promptSummaryFor(request),
    promptRecipe,
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
      promptRecipe: mockPromptRecipeFor(request),
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
