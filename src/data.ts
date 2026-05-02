import originalTile from './assets/creative/image-1.png'
import updatedTile from './assets/creative/image-2.png'
import type {
  AestheticScalar,
  ChatMessage,
  CreativeAsset,
  ImageVariant,
  SegmentAnnotation,
} from './types'

export const assets: CreativeAsset[] = [
  { id: 'tiktok-a', name: 'TikTok - Variant A', channel: 'TikTok', version: 'v 1.0.2 [Current]' },
  { id: 'meta-b', name: 'Meta - Variant B', channel: 'Meta', version: 'v 1.0.1' },
  { id: 'reddit-c', name: 'Reddit - Variant C', channel: 'Reddit', version: 'v 0.9.8' },
]

export const initialVariants: ImageVariant[] = [
  {
    id: 'original',
    title: 'Original Image',
    kind: 'original',
    image: originalTile,
    score: 74,
  },
  {
    id: 'updated',
    title: 'Updated Image',
    kind: 'updated',
    image: updatedTile,
    score: 83,
    delta: 7,
  },
]

export const initialScalars: AestheticScalar[] = [
  {
    id: 'staging',
    label: 'Staging',
    lowLabel: 'Constructed',
    highLabel: 'Candid',
    value: 78,
    marker: '> Candid',
  },
  {
    id: 'abstraction',
    label: 'Abstraction',
    lowLabel: 'Literal',
    highLabel: 'Abstract',
    value: 23,
    marker: '> Literal',
  },
  {
    id: 'novelty',
    label: 'Novelty',
    lowLabel: 'Cliche',
    highLabel: 'Surreal',
    value: 58,
    marker: 'Balanced',
  },
  {
    id: 'materiality',
    label: 'Materiality',
    lowLabel: 'Digital',
    highLabel: 'Tactile',
    value: 50,
    marker: 'Digital/Invisible',
  },
  {
    id: 'hardness',
    label: 'Hardness',
    lowLabel: 'Soft',
    highLabel: 'Hard',
    value: 80,
    marker: 'Hard/Specular',
  },
  {
    id: 'key',
    label: 'Key',
    lowLabel: 'Low',
    highLabel: 'Bright',
    value: 100,
    marker: 'Low/Dark',
  },
  {
    id: 'chromatics',
    label: 'Chromatics',
    lowLabel: 'Muted',
    highLabel: 'Vivid',
    value: 30,
    marker: 'Natural',
  },
  {
    id: 'complexity',
    label: 'Complexity',
    lowLabel: 'Minimal',
    highLabel: 'Dense',
    value: 40,
    marker: 'Minimalist',
  },
  {
    id: 'balance',
    label: 'Balance',
    lowLabel: 'Static',
    highLabel: 'Tension',
    value: 50,
    marker: 'Dynamic/Tension',
  },
  {
    id: 'depth',
    label: 'Depth',
    lowLabel: 'Planar',
    highLabel: 'Deep',
    value: 20,
    marker: 'Planar/Flat',
  },
  {
    id: 'groundedness',
    label: 'Groundedness',
    lowLabel: 'Abstract',
    highLabel: 'In Context',
    value: 100,
    marker: 'In Context',
  },
  {
    id: 'presence',
    label: 'Human Presence',
    lowLabel: 'None',
    highLabel: 'Present',
    value: 0,
    marker: 'None',
  },
  {
    id: 'gaze',
    label: 'Gaze',
    lowLabel: 'Averted',
    highLabel: 'Direct',
    value: 50,
    marker: 'Averted',
  },
  {
    id: 'valence',
    label: 'Emotional Valence',
    lowLabel: 'Negative',
    highLabel: 'Positive',
    value: 90,
    marker: 'Positive',
  },
  {
    id: 'arousal',
    label: 'Arousal',
    lowLabel: 'Calm',
    highLabel: 'High',
    value: 30,
    marker: 'Calm',
  },
  {
    id: 'stopping-power',
    label: 'Stopping Power',
    lowLabel: 'Low',
    highLabel: 'High',
    value: 10,
    marker: 'Quiet',
  },
]

export const segments: SegmentAnnotation[] = [
  {
    id: 'emotion',
    label: 'Emotional engagement',
    x: 39,
    y: 7,
    width: 25,
    height: 23,
    delta: 7,
    suggestions: [
      { id: 'face', label: 'Show more expression', impact: 9 },
      { id: 'tone', label: 'Warmer tone', impact: 4 },
      { id: 'lighting', label: 'Softer lighting', impact: 3 },
    ],
  },
  {
    id: 'resonance',
    label: 'Creative resonance',
    x: 4,
    y: 32,
    width: 80,
    height: 30,
    delta: 3,
    suggestions: [
      { id: 'copy', label: 'Make copy more intimate', impact: 5 },
      { id: 'contrast', label: 'Increase contrast', impact: 3 },
      { id: 'saturation', label: 'Reduce saturation', impact: 2 },
    ],
  },
  {
    id: 'product',
    label: 'Product placement',
    x: 40,
    y: 63,
    width: 28,
    height: 20,
    delta: 0,
    suggestions: [
      { id: 'brighten', label: 'Increase brightness', impact: 2 },
      { id: 'contrast', label: 'Increase contrast', impact: 2 },
      { id: 'warmth', label: 'Warmth', impact: 1 },
      { id: 'sat', label: 'Reduce saturation', impact: 1 },
    ],
  },
  {
    id: 'cta',
    label: 'CTA',
    x: 3,
    y: 86,
    width: 47,
    height: 11,
    delta: 0,
    suggestions: [
      { id: 'clarity', label: 'Increase CTA clarity', impact: 2 },
      { id: 'button', label: 'Sharpen button contrast', impact: 2 },
    ],
  },
]

export const initialMessages: ChatMessage[] = [
  {
    id: 'assistant-1',
    role: 'assistant',
    content:
      "Think of ways this can really trend on social media. Try showing people's face in the image.",
  },
]
