export type ScalarId =
  | 'staging'
  | 'abstraction'
  | 'novelty'
  | 'materiality'
  | 'hardness'
  | 'key'
  | 'chromatics'
  | 'complexity'
  | 'balance'
  | 'depth'
  | 'groundedness'
  | 'presence'
  | 'gaze'
  | 'valence'
  | 'arousal'
  | 'stopping-power'

export type ScalarOntologyEntry = {
  id: ScalarId
  label: string
  referenceName: string
  low: {
    value: 0
    label: string
    definition: string
    promptLanguage: string
    extremePromptLanguage?: string
  }
  mid: {
    value: 0.5
    label: string
    definition: string
    promptLanguage: string
  }
  high: {
    value: 1
    label: string
    definition: string
    promptLanguage: string
    extremePromptLanguage?: string
  }
  generationGuidance: string[]
  preservationWarnings?: string[]
}

export const scalarReferenceNameById: Record<ScalarId, string> = {
  staging: 'Staging',
  abstraction: 'Abstraction',
  novelty: 'Novelty',
  materiality: 'Process Materiality',
  hardness: 'Lighting Hardness',
  key: 'Key Lighting',
  chromatics: 'Chromatics',
  complexity: 'Complexity',
  balance: 'Balance',
  depth: 'Depth',
  groundedness: 'Groundedness',
  presence: 'Human Presence',
  gaze: 'Gaze',
  valence: 'Emotional Valence',
  arousal: 'Arousal',
  'stopping-power': 'Stopping Power',
}

export const scalarOntology: Record<ScalarId, ScalarOntologyEntry> = {
  staging: {
    id: 'staging',
    label: 'Staging',
    referenceName: 'Staging',
    low: {
      value: 0,
      label: 'Constructed',
      definition:
        'Highly posed, deliberate intervention, subject is aware of camera; every element feels placed.',
      promptLanguage:
        'Make the scene deliberately constructed, controlled, campaign-directed, and carefully arranged.',
      extremePromptLanguage:
        'Push fully toward a deliberately constructed setup: precise product/object placement, formal pose or no candid gesture, clean editorial order, and visibly intentional arrangement rather than observed life.',
    },
    mid: {
      value: 0.5,
      label: 'Constructed Candid',
      definition:
        'A staged image that borrows candid cues: relaxed posture, believable gesture, and light performance.',
      promptLanguage:
        'Balance controlled ad craft with a believable candid posture and natural gesture.',
    },
    high: {
      value: 1,
      label: 'Candid',
      definition:
        'Observational, fly-on-the-wall, no visible intervention; the subject feels caught in a real moment.',
      promptLanguage:
        'Make the staging feel candid, relaxed, naturally observed, and less overtly posed.',
      extremePromptLanguage:
        'Push fully toward an observational candid moment: spontaneous gesture, imperfect lived-in timing, minimal visible intervention, and a real caught-in-the-moment feeling while keeping product and copy legible.',
    },
    generationGuidance: [
      'Staging should change pose, gesture, prop arrangement, and the feeling of intervention.',
      'A candid shift should not make the product disappear or make the ad look accidental.',
    ],
  },
  abstraction: {
    id: 'abstraction',
    label: 'Abstraction',
    referenceName: 'Abstraction',
    low: {
      value: 0,
      label: 'Literal',
      definition:
        'The subject is recognizable, clearly contextualized, and presented with standard photographic readability.',
      promptLanguage:
        'Keep the image literal, concrete, directly photographic, and immediately readable.',
      extremePromptLanguage:
        'Push fully literal: keep the source subject, setting, product, copy, and spatial logic concrete, photographic, unabstracted, and immediately recognizable.',
    },
    mid: {
      value: 0.5,
      label: 'Designed Literal',
      definition:
        'Readable photography with a designed visual system: some simplification, geometry, or symbolic compression.',
      promptLanguage:
        'keep abstraction balanced, with enough stylization to feel designed but enough literal photography to keep the ad immediately readable.',
    },
    high: {
      value: 1,
      label: 'Abstract',
      definition:
        'The subject is partially obscured by blur, macro, shadow, geometry, or form; image meaning shifts from object to formal composition.',
      promptLanguage:
        'apply a highly abstract editorial treatment to lighting, color blocking, shadow geometry, texture, and background planes while preserving the subject, exact product package, typography/copy placement, and overall campaign structure.',
      extremePromptLanguage:
        'Push fully abstract: translate the scene into a highly reductive graphic construction with logo-like simplicity, flat color planes, symbolic shapes, contour-like figure treatment, and poster/translation-drawing clarity; keep protected product packaging, readable copy, typography placement, and campaign structure literal enough to identify.',
    },
    generationGuidance: [
      'Abstraction should affect treatment, geometry, shadow, crop, and visual organization.',
      'High abstraction still needs source fidelity for protected product, copy, typography, face/identity, and campaign layout.',
      'Do not replace the source with a new ad concept.',
    ],
    preservationWarnings: [
      'Do not let abstraction replace the source with a new ad concept.',
      'Do not abstract protected product packaging or readable typography beyond recognition.',
    ],
  },
  novelty: {
    id: 'novelty',
    label: 'Novelty',
    referenceName: 'Novelty',
    low: {
      value: 0,
      label: 'Cliche/Stock',
      definition:
        'Predictable, familiar, stock-like imagery with conventional tropes and low surprise.',
      promptLanguage:
        'Keep the image familiar, safe, conventional, and easy to understand.',
      extremePromptLanguage:
        'Push fully familiar and conventional: use safe category cues, expected composition, low surprise, and no surreal or conceptually unusual elements.',
    },
    mid: {
      value: 0.5,
      label: 'Fresh Familiar',
      definition:
        'A recognizable idea with a modest twist, fresher execution, or less expected composition.',
      promptLanguage:
        'the image should be just slightly surreal but not very surreal; add a small amount of freshness without making the image strange or conceptually confusing.',
    },
    high: {
      value: 1,
      label: 'Surreal/Novel',
      definition:
        'Logically unusual, surreal, unexpected, or highly nonstandard enough to create surprise.',
      promptLanguage:
        'Increase novelty with an unexpected editorial idea, surprising composition, or lightly surreal treatment.',
      extremePromptLanguage:
        'Push fully surreal and novel: use dream-logic visual transformation, impossible-feeling juxtaposition, unexpected scale or symbolic setting, and a strong conceptual hook while preserving product/category clarity and required copy.',
    },
    generationGuidance: [
      'Novelty should increase surprise and scroll-stop quality without breaking the shoppable structure.',
      'For ads, surreal novelty must stay subordinate to product/category clarity.',
    ],
  },
  materiality: {
    id: 'materiality',
    label: 'Materiality',
    referenceName: 'Process Materiality',
    low: {
      value: 0,
      label: 'Invisible/Digital',
      definition:
        'The medium is transparent: clean, crisp, retouched, with no visible grain, dust, chemical stains, paper texture, or process artifacts.',
      promptLanguage:
        'Keep the image clean, smooth, digitally polished, and retouched, with minimal visible process texture.',
      extremePromptLanguage:
        'Push fully clean and immaterial: remove visible grain, dust, print texture, analog artifacts, and surface noise so the image feels smooth, pristine, polished, and digitally retouched.',
    },
    mid: {
      value: 0.5,
      label: 'Subtle Tactile',
      definition:
        'A commercial image with mild photographic surface, real material cues, and some texture without heavy artifacts.',
      promptLanguage:
        'Add subtle tactile photographic surface while keeping the image commercially clean.',
    },
    high: {
      value: 1,
      label: 'Tactile/Heavy',
      definition:
        'The medium is visible and tactile: heavy grain, paper texture, wet-plate swirls, brush marks, or other physical surface evidence.',
      promptLanguage:
        'Add strong tactile process materiality: visible grain, analog texture, surface presence, and evidence of physical capture.',
      extremePromptLanguage:
        'Push fully tactile and process-heavy: make the medium visibly physical through pronounced grain, print or paper surface, analog artifacts, tactile texture, and material evidence while keeping product markings readable.',
    },
    generationGuidance: [
      'Materiality should affect photographic surface, grain, texture, artifacts, and tactile read.',
      'Product material cues can become clearer, but the product identity must not change.',
    ],
  },
  hardness: {
    id: 'hardness',
    label: 'Hardness',
    referenceName: 'Lighting Hardness',
    low: {
      value: 0,
      label: 'Soft/Diffused',
      definition:
        'Large light sources, cloudy days, softboxes, gradual transitions between highlight and shadow.',
      promptLanguage:
        'Use soft, diffused wrapping light with gradual highlight-to-shadow transitions.',
      extremePromptLanguage:
        'Push fully soft: use broad diffused light, feathered shadow transitions, low specular bite, gentle contrast, and a wrapped almost shadowless feel.',
    },
    mid: {
      value: 0.5,
      label: 'Moderately Directional',
      definition:
        'A balance of natural softness and visible light direction, with some shadow shape but no harsh edge.',
      promptLanguage:
        'Use moderately directional light with some shape while retaining natural softness.',
    },
    high: {
      value: 1,
      label: 'Hard/Specular',
      definition:
        'Small light sources, direct noon sun, unmodified flash, sharp shadow edges, and high micro-contrast.',
      promptLanguage:
        'Use hard, specular directional light with crisp shadow edges and heightened micro-contrast.',
      extremePromptLanguage:
        'Push fully hard/specular: use direct sun or flash-like light, razor-crisp cast shadows, bright specular highlights, strong edge definition, and pronounced micro-contrast without damaging product or text legibility.',
    },
    generationGuidance: [
      'Hardness changes should affect light quality, shadow edges, and micro-contrast.',
      'Do not let hard light damage product readability or source identity.',
    ],
  },
  key: {
    id: 'key',
    label: 'Key',
    referenceName: 'Key Lighting',
    low: {
      value: 0,
      label: 'Low Key',
      definition:
        'Dominance of shadows and dark tones; histogram pushed left; mood is mysterious, dramatic, or somber.',
      promptLanguage:
        'Use lower-key luminance with more shadow dominance and a darker, more dramatic tonal range.',
      extremePromptLanguage:
        'Push fully low-key: make shadows dominant, compress the image into a darker dramatic tonal range, and use highlights sparingly while keeping necessary product and text visible.',
    },
    mid: {
      value: 0.5,
      label: 'Mid Key',
      definition:
        'Balanced light and dark values; neither highlights nor shadows dominate.',
      promptLanguage:
        'Keep luminance balanced with a natural distribution of highlights, midtones, and shadows.',
    },
    high: {
      value: 1,
      label: 'High Key',
      definition:
        'Dominance of highlights and whites; histogram pushed right; mood is optimistic, ethereal, or clinical.',
      promptLanguage:
        'Increase luminance toward a brighter high-key feel with more highlights and an optimistic, airy tonal range.',
      extremePromptLanguage:
        'Push fully high-key: make the image luminous, airy, highlight-dominant, and near-white where appropriate, while preserving contrast for white text, product edges, and label readability.',
    },
    generationGuidance: [
      'Key should change tonal distribution and mood, not rewrite scene content.',
      'High-key treatment must preserve white text contrast and product legibility.',
    ],
  },
  chromatics: {
    id: 'chromatics',
    label: 'Chromatics',
    referenceName: 'Chromatics',
    low: {
      value: 0,
      label: 'Natural/Restrained',
      definition:
        'Colors represent reality as the eye sees it, with accurate white balance and restrained grading.',
      promptLanguage:
        'Use natural, muted, restrained chromatics with accurate white balance and low stylization.',
      extremePromptLanguage:
        'Push fully restrained chromatics: keep color realistic, muted, near-neutral, and low-saturation with minimal emotional grading.',
    },
    mid: {
      value: 0.5,
      label: 'Commercial Color',
      definition:
        'Color is polished and intentional but still plausible; grading supports mood without dominating.',
      promptLanguage:
        'Use polished commercial color that feels intentional but still plausible.',
    },
    high: {
      value: 1,
      label: 'Stylized',
      definition:
        'Colors are shifted for emotional effect: cross-processing, teal-orange, split toning, or heavy film emulation.',
      promptLanguage:
        'Use vivid, stylized chromatics with emotional color grading and stronger hue separation.',
      extremePromptLanguage:
        'Push fully stylized chromatics: use bold color design, strong hue separation, expressive grading, and an unmistakable palette shift while preserving brand/product color identity.',
    },
    generationGuidance: [
      'Chromatics should change palette vividness, grading, hue separation, and emotional color.',
      'Preserve brand/product color identity enough for recognition.',
    ],
  },
  complexity: {
    id: 'complexity',
    label: 'Complexity',
    referenceName: 'Complexity',
    low: {
      value: 0,
      label: 'Minimal',
      definition:
        'High negative space, few elements, clean lines, instant focus on one subject.',
      promptLanguage:
        'Reduce visual complexity with fewer elements, cleaner lines, and clearer negative space.',
      extremePromptLanguage:
        'Push fully minimal: remove nonessential props, people, background clutter, and secondary points of interest; use one dominant subject or product, clean geometry, and large negative space whenever the brief allows.',
    },
    mid: {
      value: 0.5,
      label: 'Organized Complexity',
      definition:
        'Multiple elements are present but clearly organized, legible, and not visually noisy.',
      promptLanguage:
        'Use organized complexity with enough detail for richness while maintaining a clear visual hierarchy.',
    },
    high: {
      value: 1,
      label: 'Maximal',
      definition:
        'The frame is filled with detail, texture, and multiple points of interest; pleasing visual clutter.',
      promptLanguage:
        'Increase frame richness with more detail, texture, and layered points of interest while keeping the ad hierarchy readable.',
      extremePromptLanguage:
        'Push fully maximal: fill the frame with layered detail, texture, repeated elements, secondary discoveries, and dense visual richness while maintaining a readable product/copy hierarchy.',
    },
    generationGuidance: [
      'Complexity should affect density of detail and visual hierarchy.',
      'Do not obscure product, CTA, or typography when increasing complexity.',
    ],
  },
  balance: {
    id: 'balance',
    label: 'Balance',
    referenceName: 'Balance',
    low: {
      value: 0,
      label: 'Dynamic',
      definition:
        'Asymmetry, diagonal lines, edge weighting, dutch angles, or off-balance composition that creates movement or unease.',
      promptLanguage:
        'Shift toward dynamic balance with asymmetry, diagonal energy, and more visual movement.',
      extremePromptLanguage:
        'Push fully dynamic: use strong asymmetry, diagonal structure, off-center weighting, directional tension, and visible compositional motion without cutting off protected content.',
    },
    mid: {
      value: 0.5,
      label: 'Balanced Tension',
      definition:
        'A composition with some movement but enough stability to feel intentional.',
      promptLanguage:
        'Use balanced tension: stable enough for clarity but with some asymmetry and motion.',
    },
    high: {
      value: 1,
      label: 'Static/Harmony',
      definition:
        'Symmetry, centered subjects, leveled horizons, and a sense of permanence and stillness.',
      promptLanguage:
        'Shift toward static harmony with centered structure, leveled alignment, and a calmer sense of permanence.',
      extremePromptLanguage:
        'Push fully static and harmonious: use strict centering, symmetry or near-symmetry, leveled horizons, stable geometry, and calm permanence.',
    },
    generationGuidance: [
      'Balance should affect composition, weighting, line direction, and visual stability.',
      'When moving toward dynamic tension, preserve text safe zones and product placement.',
    ],
  },
  depth: {
    id: 'depth',
    label: 'Depth',
    referenceName: 'Depth',
    low: {
      value: 0,
      label: 'Flat/Planar',
      definition:
        'Telephoto compression, perpendicular shooting, flat-lay views, or minimal z-axis separation; image feels graphic and 2D.',
      promptLanguage:
        'Flatten depth with a more planar, graphic, compressed spatial read.',
      extremePromptLanguage:
        'Push fully planar: compress the scene into a flat, poster-like, orthographic or flat-lay spatial read with minimal foreground/background separation.',
    },
    mid: {
      value: 0.5,
      label: 'Moderate Depth',
      definition:
        'Some foreground, midground, and background separation without strong spatial drama.',
      promptLanguage:
        'Use moderate spatial depth with natural foreground, midground, and background separation.',
    },
    high: {
      value: 1,
      label: 'Deep',
      definition:
        'Strong leading lines, wide-angle foreground interest, and distinct foreground/midground/background layers.',
      promptLanguage:
        'Create deeper spatial layering with foreground interest, midground subject/product, and background separation.',
      extremePromptLanguage:
        'Push fully deep: use pronounced foreground, midground, and background layers, stronger perspective cues, leading lines, and clear spatial separation without cropping protected content.',
    },
    generationGuidance: [
      'Depth should affect perspective, layering, foreground/background separation, and spatial cues.',
      'Do not use depth changes to crop away protected copy or product.',
    ],
  },
  groundedness: {
    id: 'groundedness',
    label: 'Groundedness',
    referenceName: 'Groundedness',
    low: {
      value: 0,
      label: 'Studio/Void',
      definition:
        'Infinite white, black, or colored background; no sense of place; the object exists in a vacuum.',
      promptLanguage:
        'Reduce environmental context toward a clean studio or void-like setting.',
      extremePromptLanguage:
        'Push fully studio/void: remove contextual location cues and place the subject/product in a controlled empty studio, seamless backdrop, or abstract void-like environment when compatible with source locks.',
    },
    mid: {
      value: 0.5,
      label: 'Implied Context',
      definition:
        'Some contextual cues are present, but the scene still feels controlled and not fully lived-in.',
      promptLanguage:
        'Use enough environmental context to ground the product without making the scene busy.',
    },
    high: {
      value: 1,
      label: 'In Situ',
      definition:
        'The subject is in a real-world environment such as a coffee shop, messy desk, street, or lived-in location that implies use.',
      promptLanguage:
        'Ground the image in a real-world in-situ environment with credible context and narrative cues of use.',
      extremePromptLanguage:
        'Push fully in-situ: make the environment feel specific, lived-in, credible, and narratively useful, with concrete contextual cues that remain related to the source campaign.',
    },
    generationGuidance: [
      'Groundedness should affect environmental context and sense of place.',
      'In-situ context must remain source-related and not introduce an unrelated campaign scene.',
    ],
  },
  presence: {
    id: 'presence',
    label: 'Human Presence',
    referenceName: 'Human Presence',
    low: {
      value: 0,
      label: 'Nobody',
      definition:
        'Pure scenery, texture, or product isolation. No humans visible.',
      promptLanguage:
        'Minimize human presence and let product, setting, or texture carry the frame.',
      extremePromptLanguage:
        'Push fully to no human presence: remove or omit visible people, faces, bodies, and hands; let the product, setting, composition, or texture carry the image by itself.',
    },
    mid: {
      value: 0.5,
      label: 'Environmental Figure',
      definition:
        'A person is present but part of the scene, not the dominant face or portrait subject.',
      promptLanguage:
        'Include people as environmental figures while keeping the broader scene and product important.',
    },
    high: {
      value: 1,
      label: 'Portrait',
      definition:
        'The face is dominant, human connection is primary, and eye contact or facial presence has high impact.',
      promptLanguage:
        'Make human presence dominant, with clear facial readability and stronger emotional connection.',
      extremePromptLanguage:
        'Push fully portrait/human-led: make visible people or faces the dominant emotional read, with clear facial readability and strong human connection while avoiding unsupported extra people.',
    },
    generationGuidance: [
      'Human presence changes should affect human scale and visibility.',
      'Do not add extra people unless the source/campaign can support it.',
    ],
  },
  gaze: {
    id: 'gaze',
    label: 'Gaze',
    referenceName: 'Gaze',
    low: {
      value: 0,
      label: 'Averted',
      definition:
        'The subject looks away from the lens; feels voyeuristic, unaware, or internally focused.',
      promptLanguage:
        'Use averted gaze so the subject feels internally focused or observed rather than directly addressing the viewer.',
      extremePromptLanguage:
        'Push fully averted gaze: avoid eye contact with the camera entirely and direct attention inward, toward another subject, the product, or the environment.',
    },
    mid: {
      value: 0.5,
      label: 'Peripheral/Soft',
      definition:
        'Gaze neither fully confronts nor fully avoids the viewer; connection is partial.',
      promptLanguage:
        'Use a soft, partially engaged gaze that creates some connection without direct address.',
    },
    high: {
      value: 1,
      label: 'Direct',
      definition:
        'The subject looks straight into the lens, breaking the fourth wall and increasing stopping power.',
      promptLanguage:
        'Use direct gaze into the lens for stronger viewer engagement and stopping power.',
      extremePromptLanguage:
        'Push fully direct gaze: make eye contact unmistakable and central to viewer engagement, while preserving identity and product/copy readability.',
    },
    generationGuidance: [
      'Gaze should affect eye direction and viewer relationship.',
      'Preserve identity/face likeness when changing gaze in source-preserving edits.',
    ],
  },
  valence: {
    id: 'valence',
    label: 'Emotional Valence',
    referenceName: 'Emotional Valence',
    low: {
      value: 0,
      label: 'Negative',
      definition:
        'Sadness, fear, anger, disgust, isolation, dystopia, or problem/solution tension.',
      promptLanguage:
        'Shift emotional valence darker or more problem-oriented, with restraint appropriate for the brand.',
      extremePromptLanguage:
        'Push fully negative/tense: make the emotional mood clearly darker, more isolated, problem-oriented, austere, or uneasy while staying brand-appropriate.',
    },
    mid: {
      value: 0.5,
      label: 'Ambiguous',
      definition:
        'Emotion is restrained, neutral, complex, or hard to read.',
      promptLanguage:
        'Keep emotional valence nuanced and restrained rather than clearly euphoric or negative.',
    },
    high: {
      value: 1,
      label: 'Positive',
      definition:
        'Joy, euphoria, satisfaction, comfort, optimism, or utopian mood.',
      promptLanguage:
        'Shift emotional valence toward joy, satisfaction, comfort, and optimistic warmth.',
      extremePromptLanguage:
        'Push fully positive: make the emotional mood unmistakably joyful, warm, comfortable, satisfied, or optimistic without becoming melodramatic or changing the ad copy.',
    },
    generationGuidance: [
      'Valence should affect expression, mood, color/emotional tone, and brand feeling.',
      'Avoid melodrama or unsupported emotional claims in ad copy.',
    ],
  },
  arousal: {
    id: 'arousal',
    label: 'Arousal',
    referenceName: 'Arousal',
    low: {
      value: 0,
      label: 'Calm',
      definition:
        'Serenity, boredom, relaxation, stillness, spa/luxury bedding energy.',
      promptLanguage:
        'Lower arousal with stillness, serenity, calm posture, and slower visual energy.',
      extremePromptLanguage:
        'Push fully calm: make the image nearly still-life in tempo, serene, quiet, composed, and low-motion.',
    },
    mid: {
      value: 0.5,
      label: 'Alert',
      definition:
        'Some energy or psychological tension, but the subject and composition remain controlled.',
      promptLanguage:
        'Use alert but controlled energy with subtle tension and visual attention.',
    },
    high: {
      value: 1,
      label: 'Exciting',
      definition:
        'Action, intense laughter, movement, chaos, sports/energy-drink or viral-content intensity.',
      promptLanguage:
        'Increase arousal with movement, liveliness, high energy, and more urgent visual rhythm.',
      extremePromptLanguage:
        'Push fully high-arousal: use visible motion, urgent rhythm, lively gesture, kinetic composition, and energetic expression while keeping product/copy readable.',
    },
    generationGuidance: [
      'Arousal should affect motion, tempo, expression, and energy.',
      'High arousal should not make product/copy unreadable.',
    ],
  },
  'stopping-power': {
    id: 'stopping-power',
    label: 'Stopping Power',
    referenceName: 'Stopping Power',
    low: {
      value: 0,
      label: 'Muted',
      definition:
        'Low contrast, pastel colors, gradual lines, and low immediate visual impact.',
      promptLanguage:
        'Keep stopping power muted with lower contrast, softer color, and quieter visual impact.',
      extremePromptLanguage:
        'Push fully quiet: reduce immediate visual interruption with subdued contrast, soft color, gentle hierarchy, and a deliberately low-key feed presence.',
    },
    mid: {
      value: 0.5,
      label: 'Noticeable',
      definition:
        'A feed-readable image with some contrast, clarity, or hook, but not aggressive pop.',
      promptLanguage:
        'Use noticeable but controlled contrast and a clear visual hook.',
    },
    high: {
      value: 1,
      label: 'Pop',
      definition:
        'Neon colors, extreme contrast, glitch aesthetics, or unexpected juxtapositions that grab attention.',
      promptLanguage:
        'Increase stopping power with stronger contrast, cleaner visual hook, sharper hierarchy, and attention-grabbing pop.',
      extremePromptLanguage:
        'Push fully feed-stopping: create a bold immediate hook through extreme clarity, contrast, scale, color, or juxtaposition, while preserving product, copy, and brand integrity.',
    },
    generationGuidance: [
      'Stopping power should affect immediate feed impact, contrast, hook strength, and visual surprise.',
      'Do not use attention-grabbing effects that compromise brand/product integrity.',
    ],
  },
}

export function isScalarId(id: string): id is ScalarId {
  return id in scalarOntology
}
