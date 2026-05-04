import type {
  CreativeGenerationRequest,
  CreativeGenerationResult,
  ImageProviderMode,
  PromptRecipe,
  SourceFidelityAuthorityStatus,
  SourceFidelityCheckStatus,
  SourceFidelityEvidence,
  SourceFidelityReport,
} from './types'

type EndpointGenerationResult = Partial<
  Omit<CreativeGenerationResult, 'requestId' | 'provider' | 'sourceFidelity'>
> & {
  finalPrompt?: string
  negativePrompt?: string
  visualRead?: string
  composerModel?: string
  observability?: PromptRecipe['observability']
  providerMode?: string
  sourceFidelity?: Partial<SourceFidelityReport>
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
        request.promptComposer.scalarPromptTranslation.fullRecipeInstructions.find((line) =>
          line.toLowerCase().startsWith(`${scalar.label.toLowerCase()}:`),
        ) ?? `${scalar.label} interpreted from ${scalar.value}/100 for prompt composition.`,
    })),
    observability: [
      {
        lane: 'context',
        text: request.promptComposer.scalarPromptTranslation.compactObservability.join(' | '),
      },
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

function isFallbackProviderMode(providerMode?: string) {
  return /safety-retry-generation|fallback-generation|text-to-image|generation-fallback|endpoint-failed|unchanged-output/i.test(
    providerMode ?? '',
  )
}

function endpointFallbackResult(
  request: CreativeGenerationRequest,
  reason: string,
): EndpointGenerationResult {
  return {
    providerMode: 'endpoint-failed-fallback-preview',
    finalPrompt: request.imagePrompt.promptDraft,
    negativePrompt: request.imagePrompt.negativePrompt,
    visualRead:
      request.sourceVariant.visualContext?.summary ??
      `Endpoint failed before returning an image for ${request.sourceVariant.title}.`,
    ingredients: ['Endpoint fallback preview', ...request.scalarChanges.map((change) => change.label)],
    sourceFidelity: {
      providerMode: 'endpoint-failed-fallback-preview',
      mode: 'fallback-generation',
      confidence: 'low',
      status: 'warning',
      evidence: {
        endpoint: generationEndpoint ?? 'configured generation endpoint',
        model: request.model,
        imageInputCount: request.imageInputs.length,
        imageInputRoles: request.imageInputs.map(
          (input, index) => `${index}:${input.role}:${input.referenceType ?? 'creative'}`,
        ),
        fallbackReason: reason,
      },
      warnings: [
        reason,
        'The canvas is showing the source image as a fallback preview, not a source-preserving generated remix.',
      ],
      notes: ['Endpoint did not return a usable generated image.'],
    },
  }
}

function sourceFidelityStatusFromCheck(
  status?: SourceFidelityCheckStatus,
): SourceFidelityAuthorityStatus {
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  return 'warning'
}

function sourceFidelityCheckFor(
  checks: SourceFidelityReport['checks'],
  id: SourceFidelityReport['checks'][number]['id'],
) {
  return checks.find((check) => check.id === id)?.status
}

function sourceFidelityEvidenceFor(
  request: CreativeGenerationRequest,
  result: EndpointGenerationResult,
  provider: CreativeGenerationResult['provider'],
  providerMode: string,
): SourceFidelityEvidence | undefined {
  const reportedEvidence = result.sourceFidelity?.evidence
  if (reportedEvidence) {
    return {
      ...reportedEvidence,
      imageInputRoles:
        reportedEvidence.imageInputRoles ??
        request.imageInputs.map((input, index) => `${index}:${input.role}:${input.referenceType ?? 'creative'}`),
    }
  }

  if (provider === 'mock') {
    return {
      endpoint: 'local mock',
      model: `${request.model}-mock`,
      imageInputCount: request.imageInputs.length,
      imageInputRoles: request.imageInputs.map(
        (input, index) => `${index}:${input.role}:${input.referenceType ?? 'creative'}`,
      ),
    }
  }

  if (isFallbackProviderMode(providerMode)) {
    return {
      endpoint: '/v1/images/generations',
      model: request.model,
      imageInputCount: 0,
      imageInputRoles: [],
      fallbackReason: 'Endpoint did not report source-preserving edit evidence.',
    }
  }

  return undefined
}

function sourceFidelityStatusFor({
  provider,
  fallbackMode,
  checks,
  evidence,
}: {
  provider: CreativeGenerationResult['provider']
  fallbackMode: boolean
  checks: SourceFidelityReport['checks']
  evidence?: SourceFidelityEvidence
}): SourceFidelityAuthorityStatus {
  if (fallbackMode) return 'warning'
  if (provider === 'mock') return 'warning'
  if (!evidence) return 'warning'
  if (evidence.endpoint && !/\/v1\/images\/edits|image-edit/i.test(evidence.endpoint)) {
    return 'warning'
  }
  if ((evidence.imageInputCount ?? 0) < 1) return 'failed'
  if (checks.some((check) => check.status === 'failed')) return 'failed'
  if (checks.some((check) => check.status === 'needs-review' || check.status === 'not-run')) {
    return 'warning'
  }
  return 'passed'
}

function sourceFidelityReportFor(
  request: CreativeGenerationRequest,
  result: EndpointGenerationResult,
  provider: CreativeGenerationResult['provider'],
): SourceFidelityReport {
  const providerMode =
    result.providerMode ??
    result.sourceFidelity?.providerMode ??
    (provider === 'mock' ? 'mock-source-preserving-edit' : 'unverified-endpoint')
  const fallbackMode = isFallbackProviderMode(providerMode)
  const reportMode: SourceFidelityReport['mode'] =
    provider === 'mock' ? 'mock' : fallbackMode ? 'fallback-generation' : 'source-preserving-edit'
  const hasEndpointAuthorityReport = Boolean(result.sourceFidelity)
  const defaultConfidence: SourceFidelityReport['confidence'] =
    reportMode === 'fallback-generation'
      ? 'low'
      : reportMode === 'mock'
        ? 'medium'
        : hasEndpointAuthorityReport
          ? 'high'
          : 'medium'
  const defaultChecks: SourceFidelityReport['checks'] = [
    {
      id: 'generation',
      label: 'Generation succeeded',
      status: 'passed',
      detail: `${request.outputTitle} returned an image result.`,
    },
    {
      id: 'source-edit',
      label: 'Source-preserving edit',
      status:
        reportMode === 'fallback-generation'
          ? 'failed'
          : provider === 'mock'
            ? 'not-run'
            : hasEndpointAuthorityReport
              ? 'passed'
              : 'needs-review',
      detail:
        reportMode === 'fallback-generation'
          ? 'The worker entered fallback generation, so source anchoring is lower confidence.'
          : provider === 'mock'
            ? 'Mock mode cannot verify edit-route source anchoring.'
            : hasEndpointAuthorityReport
              ? 'The endpoint reported a source-preserving edit route.'
              : 'The endpoint returned an image but did not report edit-route source anchoring evidence.',
    },
    {
      id: 'product-lock',
      label: 'Product lock',
      status:
        reportMode === 'fallback-generation' || !hasEndpointAuthorityReport
          ? 'needs-review'
          : provider === 'mock'
            ? 'not-run'
            : 'passed',
      detail: 'Verify the advertised product package still matches the source.',
    },
    {
      id: 'copy-lock',
      label: 'Copy lock',
      status:
        reportMode === 'fallback-generation' || !hasEndpointAuthorityReport
          ? 'needs-review'
          : provider === 'mock'
            ? 'not-run'
            : 'passed',
      detail: 'Verify copywriting stayed exact for normal remix mode.',
    },
    {
      id: 'type-lock',
      label: 'Typography lock',
      status:
        reportMode === 'fallback-generation' || !hasEndpointAuthorityReport
          ? 'needs-review'
          : provider === 'mock'
            ? 'not-run'
            : 'passed',
      detail: 'Verify font family, weight, casing, tracking, and placement stayed equivalent.',
    },
    {
      id: 'identity-lock',
      label: 'Identity lock',
      status:
        reportMode === 'fallback-generation' || !hasEndpointAuthorityReport
          ? 'needs-review'
          : provider === 'mock'
            ? 'not-run'
            : 'passed',
      detail: 'Verify the result remains recognizably related to the selected source image.',
    },
    {
      id: 'slider-intent',
      label: 'Slider intent',
      status: provider === 'mock' ? 'not-run' : 'passed',
      detail: `${request.scalarChanges.length || request.scalars.length} scalar controls were sent as prompt context.`,
    },
  ]
  const defaultWarnings =
    reportMode === 'fallback-generation'
      ? [
          'Fallback generation is not source-faithful by default.',
          'Treat product, copy, typography, and identity locks as unverified until the critic passes.',
        ]
      : !hasEndpointAuthorityReport && provider === 'endpoint'
        ? [
            'Endpoint response did not include source-fidelity evidence.',
            'Treat the remix as unverified until the worker reports endpoint, image input count, and lock checks.',
          ]
      : []
  const checks = result.sourceFidelity?.checks?.length ? result.sourceFidelity.checks : defaultChecks
  const evidence = sourceFidelityEvidenceFor(request, result, provider, providerMode)
  const status = sourceFidelityStatusFor({
    provider,
    fallbackMode,
    checks,
    evidence,
  })
  const productLock =
    result.sourceFidelity?.productLock ?? sourceFidelityStatusFromCheck(sourceFidelityCheckFor(checks, 'product-lock'))
  const copyLock =
    result.sourceFidelity?.copyLock ?? sourceFidelityStatusFromCheck(sourceFidelityCheckFor(checks, 'copy-lock'))
  const typographyLock =
    result.sourceFidelity?.typographyLock ?? sourceFidelityStatusFromCheck(sourceFidelityCheckFor(checks, 'type-lock'))
  const identityLock =
    result.sourceFidelity?.identityLock ?? sourceFidelityStatusFromCheck(sourceFidelityCheckFor(checks, 'identity-lock'))
  const sourceRelation =
    result.sourceFidelity?.sourceRelation ??
    sourceFidelityStatusFromCheck(sourceFidelityCheckFor(checks, 'source-edit'))
  const notes = uniqueItems([
    ...(result.sourceFidelity?.notes ?? []),
    ...defaultWarnings,
    evidence?.endpoint ? `endpoint=${evidence.endpoint}` : '',
    typeof evidence?.imageInputCount === 'number' ? `image inputs attached=${evidence.imageInputCount}` : '',
    typeof evidence?.imageTokens === 'number' ? `image tokens=${evidence.imageTokens}` : '',
  ])

  return {
    providerMode: providerMode as ImageProviderMode,
    status: result.sourceFidelity?.status ?? status,
    productLock,
    copyLock,
    typographyLock,
    identityLock,
    sourceRelation,
    notes,
    evidence,
    confidence: result.sourceFidelity?.confidence ?? defaultConfidence,
    mode: result.sourceFidelity?.mode ?? reportMode,
    summary:
      result.sourceFidelity?.summary ??
      (reportMode === 'fallback-generation'
          ? 'Image returned through fallback generation; source fidelity needs review.'
          : provider === 'mock'
            ? 'Mock generation used the source image as a local preview; real fidelity gates were not run.'
            : hasEndpointAuthorityReport
              ? 'Source-preserving edit route reported by endpoint.'
              : 'Endpoint image result is present, but source fidelity is unverified until the worker reports edit evidence.'),
    checks,
    warnings: result.sourceFidelity?.warnings ?? defaultWarnings,
    critic:
      result.sourceFidelity?.critic ??
      (provider === 'mock'
        ? {
            status: 'not-run',
            summary: 'Vision critic is not run in mock mode.',
          }
        : {
            status: reportMode === 'fallback-generation' ? 'needs-review' : 'passed',
            summary:
              reportMode === 'fallback-generation'
                ? 'Run the post-generation critic before accepting this remix.'
                : 'Endpoint did not report critic issues.',
          }),
  }
}

function normalizeGenerationResult(
  request: CreativeGenerationRequest,
  result: EndpointGenerationResult,
  provider: CreativeGenerationResult['provider'],
): CreativeGenerationResult {
  const unchangedEndpointImage =
    provider === 'endpoint' && Boolean(result.image) && result.image === request.fallbackImage
  const fidelityResult: EndpointGenerationResult = unchangedEndpointImage
    ? {
        ...result,
        providerMode: result.providerMode ?? 'unchanged-output-fallback-preview',
        sourceFidelity: {
          ...result.sourceFidelity,
          providerMode:
            result.sourceFidelity?.providerMode ??
            result.providerMode ??
            'unchanged-output-fallback-preview',
          mode: result.sourceFidelity?.mode ?? 'fallback-generation',
          confidence: result.sourceFidelity?.confidence ?? 'low',
          status: result.sourceFidelity?.status ?? 'warning',
          evidence: {
            ...result.sourceFidelity?.evidence,
            fallbackReason:
              result.sourceFidelity?.evidence?.fallbackReason ??
              'Endpoint returned an image identical to the selected canvas source.',
          },
          warnings: uniqueItems([
            ...(result.sourceFidelity?.warnings ?? []),
            'Endpoint returned an image identical to the selected canvas source; treat this as an unaccepted fallback preview.',
          ]),
        },
      }
    : result
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
  const promptRecipe = promptRecipeFromEndpoint(request, fidelityResult)
  const sourceFidelity = sourceFidelityReportFor(request, fidelityResult, provider)
  const fallbackIngredient =
    sourceFidelity.mode === 'fallback-generation' ? 'Fallback generated' : ''

  return {
    requestId: request.id,
    title: fidelityResult.title ?? request.outputTitle,
    image: fidelityResult.image ?? request.fallbackImage,
    score: fidelityResult.score ?? projectedScore,
    delta: fidelityResult.delta ?? Math.max(1, projectedScore - request.sourceVariant.score),
    filter: fidelityResult.filter ?? request.baseFilter,
    ingredients: uniqueItems([...ingredients, fallbackIngredient]).slice(0, 4),
    sourceIds: fidelityResult.sourceIds ?? request.sourceIds,
    provider,
    providerMode: sourceFidelity.providerMode,
    promptSummary: fidelityResult.promptSummary ?? promptRecipe.finalPrompt ?? promptSummaryFor(request),
    promptRecipe,
    sourceFidelity,
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

  if (!response.ok) {
    return endpointFallbackResult(
      request,
      `Generation endpoint returned ${response.status} ${response.statusText || 'without a usable image response'}.`,
    )
  }

  const result = (await response.json()) as EndpointGenerationResult

  if (!result.image) {
    const fallback = endpointFallbackResult(
      request,
      'Generation endpoint completed without returning a generated image URL or data URL.',
    )

    return {
      ...fallback,
      ...result,
      providerMode: result.providerMode ?? 'endpoint-failed-fallback-preview',
      sourceFidelity: {
        ...fallback.sourceFidelity,
        ...result.sourceFidelity,
      },
    }
  }

  return result
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function simulateGeneration(request: CreativeGenerationRequest) {
  await wait(1200)
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
  } catch (error) {
    if (generationEndpoint && !(typeof navigator !== 'undefined' && navigator.webdriver)) {
      const message = error instanceof Error ? error.message : 'Generation endpoint failed.'
      return normalizeGenerationResult(
        request,
        endpointFallbackResult(request, message),
        'endpoint',
      )
    }

    return simulateGeneration(request)
  }

  return simulateGeneration(request)
}
