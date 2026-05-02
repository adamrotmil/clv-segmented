export type CreativeAsset = {
  id: string
  name: string
  channel: string
  version: string
}

export type ImageVariant = {
  id: string
  title: string
  kind: 'original' | 'updated' | 'generated'
  image: string
  score: number
  delta?: number
  filter?: string
  ingredients?: string[]
  sourceIds?: string[]
}

export type CreativeGenerationIntent = 'scalar-remix' | 'idea-combine' | 'segment-edit'

export type AestheticScalar = {
  id: string
  label: string
  lowLabel: string
  highLabel: string
  value: number
  marker?: string
}

export type SegmentSuggestion = {
  id: string
  label: string
  impact: number
}

export type SegmentAnnotation = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  delta: number
  suggestions: SegmentSuggestion[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type ScalarGenerationChange = {
  id: string
  label: string
  before: number
  after: number
  lowLabel: string
  highLabel: string
  marker?: string
}

export type CreativeGenerationRequest = {
  id: string
  intent: CreativeGenerationIntent
  outputTitle: string
  createdAt: string
  asset: CreativeAsset
  sourceVariant: ImageVariant
  sourceIds: string[]
  selectedSegment: SegmentAnnotation
  scalars: AestheticScalar[]
  scalarChanges: ScalarGenerationChange[]
  chatContext: ChatMessage[]
  latestTrace: {
    control: string
    what: string
    why: string
    ingredients: string[]
  }
  savedIdeas: Array<{
    label: string
    score: number
    ingredients: string[]
  }>
  projectedScore: number
  scoreLift: number
  baseFilter: string
  fallbackImage: string
  promptHints: string[]
}

export type CreativeGenerationResult = {
  requestId: string
  title: string
  image: string
  score: number
  delta: number
  filter: string
  ingredients: string[]
  sourceIds: string[]
  provider: 'endpoint' | 'mock'
  promptSummary: string
}
