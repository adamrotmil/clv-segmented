import type { ScalarId } from './ontology'

export type ScalarVisualCalibration = {
  id: ScalarId
  file: string
  lowVisualNotes: string[]
  highVisualNotes: string[]
  transitionNotes: string[]
  promptExamples: {
    low: string
    mid: string
    high: string
  }
  avoidCopyingLiterally: string[]
}

const scalarImageBase = `${import.meta.env.BASE_URL}images/scalars`

export const scalarVisualCalibration: Record<ScalarId, ScalarVisualCalibration> = {
  staging: {
    id: 'staging',
    file: `${scalarImageBase}/Staging.png`,
    lowVisualNotes: ['deliberate prop placement', 'posed subject awareness', 'controlled campaign craft'],
    highVisualNotes: ['observed gesture', 'less camera awareness', 'relaxed editorial lifestyle moment'],
    transitionNotes: [
      'Increasing staging should make the image feel less intervened with and more naturally observed.',
      'Decreasing staging should make pose, product, and composition feel more deliberately arranged.',
    ],
    promptExamples: {
      low: 'Make the scene clearly constructed and campaign-directed, with deliberate pose and prop placement.',
      mid: 'Keep the scene crafted but believable, with staged clarity and a candid surface read.',
      high: 'Make the scene feel candid and observational, as if caught in a real lifestyle moment.',
    },
    avoidCopyingLiterally: ['Do not copy the specific subjects or products from the calibration strip.'],
  },
  abstraction: {
    id: 'abstraction',
    file: `${scalarImageBase}/Abstraction.png`,
    lowVisualNotes: ['clear subject recognition', 'standard readable context', 'literal product/story clarity'],
    highVisualNotes: ['simplified form', 'geometric shadow and crop', 'subject becomes shape, symbol, or atmosphere'],
    transitionNotes: [
      'Increasing abstraction should simplify literal representation and emphasize form, geometry, shadow, and color blocks.',
      'Decreasing abstraction should restore concrete subject, product, and scene readability.',
    ],
    promptExamples: {
      low: 'Keep the image literal, concrete, and directly photographic.',
      mid: 'Use a designed but readable photographic treatment with some geometric simplification.',
      high: 'Use a very high degree of abstraction through simplified form, shadow geometry, and color blocking while preserving protected product/copy/type regions.',
    },
    avoidCopyingLiterally: ['Do not copy calibration-strip products, props, or layouts into the generated ad.'],
  },
  novelty: {
    id: 'novelty',
    file: `${scalarImageBase}/Novelty.png`,
    lowVisualNotes: ['familiar stock trope', 'predictable composition', 'expected category cue'],
    highVisualNotes: ['surprising visual logic', 'unusual juxtaposition', 'feed-stopping conceptual twist'],
    transitionNotes: [
      'Increasing novelty should add freshness or surprise without making the campaign unrelated.',
      'Decreasing novelty should make the result safer, more familiar, and more conventional.',
    ],
    promptExamples: {
      low: 'Keep the ad familiar and conventional, with low conceptual surprise.',
      mid: 'Add a modest fresh twist while staying recognizable and shoppable.',
      high: 'Add a high-novelty editorial idea or lightly surreal juxtaposition while preserving source campaign structure.',
    },
    avoidCopyingLiterally: ['Do not reuse surreal props or unrelated product categories from the strip.'],
  },
  materiality: {
    id: 'materiality',
    file: `${scalarImageBase}/Process%20Materiality.png`,
    lowVisualNotes: ['clean digital capture', 'smooth retouched surfaces', 'low grain or process artifacts'],
    highVisualNotes: ['visible grain', 'analog surface', 'scratches, texture, print, film, or process evidence'],
    transitionNotes: [
      'Increasing materiality should make the photographic medium and real surfaces more visible.',
      'Decreasing materiality should make the image cleaner, smoother, and more digitally polished.',
    ],
    promptExamples: {
      low: 'Keep the image clean, retouched, and digitally polished, with minimal visible process texture.',
      mid: 'Add a subtle tactile photographic surface while keeping the image commercially clean.',
      high: 'Add strong tactile process materiality: visible grain, analog texture, slight film artifacts, and physical surface presence.',
    },
    avoidCopyingLiterally: ['Do not copy cereal packaging, candy bags, or unrelated products from the reference strip.'],
  },
  hardness: {
    id: 'hardness',
    file: `${scalarImageBase}/Lighting%20Hardness.png`,
    lowVisualNotes: ['diffused wrapping light', 'gradual shadow transitions', 'soft flattering edge quality'],
    highVisualNotes: ['direct flash or sun', 'crisp shadow edges', 'heightened micro-contrast and specular highlights'],
    transitionNotes: [
      'Increasing hardness should sharpen shadow edges and increase micro-contrast.',
      'Decreasing hardness should wrap light more softly around subject and product.',
    ],
    promptExamples: {
      low: 'Use soft, diffused wrapping light with gentle shadow transitions.',
      mid: 'Use moderately directional light with visible shape but natural softness.',
      high: 'Use hard, specular directional light with crisp shadow edges and stronger micro-contrast.',
    },
    avoidCopyingLiterally: ['Do not copy the reference strip scenes; only use the light-quality calibration.'],
  },
  key: {
    id: 'key',
    file: `${scalarImageBase}/Key%20Lighting.png`,
    lowVisualNotes: ['shadow-dominant frame', 'dramatic dark tones', 'low-key mood'],
    highVisualNotes: ['highlight-dominant frame', 'bright whites', 'airy, optimistic, high-key mood'],
    transitionNotes: [
      'Increasing key should brighten the tonal distribution and emphasize highlights.',
      'Decreasing key should increase shadow dominance and tonal drama.',
    ],
    promptExamples: {
      low: 'Use a low-key tonal range with more shadow dominance and dramatic mood.',
      mid: 'Use balanced luminance with natural highlights, midtones, and shadows.',
      high: 'Use a high-key luminous treatment with brighter highlights and an airy optimistic tone.',
    },
    avoidCopyingLiterally: ['Do not copy unrelated scenes; only use tonal distribution as calibration.'],
  },
  chromatics: {
    id: 'chromatics',
    file: `${scalarImageBase}/Chromatics.png`,
    lowVisualNotes: ['natural color', 'accurate white balance', 'restrained saturation'],
    highVisualNotes: ['stylized hue shift', 'emotional color grading', 'vivid palette separation'],
    transitionNotes: [
      'Increasing chromatics should stylize color and make hue relationships more emotionally expressive.',
      'Decreasing chromatics should mute vividness and return toward restrained natural color.',
    ],
    promptExamples: {
      low: 'Use muted, restrained, natural chromatics with accurate white balance.',
      mid: 'Use polished commercial color that remains plausible.',
      high: 'Use vivid stylized chromatics with stronger emotional color grading and hue separation.',
    },
    avoidCopyingLiterally: ['Do not copy strip-specific brand colors or product palettes verbatim.'],
  },
  complexity: {
    id: 'complexity',
    file: `${scalarImageBase}/Complexity.png`,
    lowVisualNotes: ['negative space', 'few elements', 'single clear focal point'],
    highVisualNotes: ['many details', 'textures and layered interest', 'pleasing visual clutter'],
    transitionNotes: [
      'Increasing complexity should add layered detail and texture while keeping hierarchy intact.',
      'Decreasing complexity should simplify the frame and increase negative space.',
    ],
    promptExamples: {
      low: 'Reduce visual complexity with cleaner lines, fewer elements, and strong negative space.',
      mid: 'Use organized complexity with richness but clear hierarchy.',
      high: 'Increase frame richness with layered details, textures, and multiple points of interest without obscuring product or copy.',
    },
    avoidCopyingLiterally: ['Do not copy product clusters or object arrangements from the strip.'],
  },
  balance: {
    id: 'balance',
    file: `${scalarImageBase}/Balance.png`,
    lowVisualNotes: ['asymmetry', 'diagonal tension', 'edge weighting and motion'],
    highVisualNotes: ['centered order', 'symmetry', 'leveled horizon and stillness'],
    transitionNotes: [
      'Increasing balance should move toward stable harmony and centered order.',
      'Decreasing balance should create more dynamic tension and asymmetrical movement.',
    ],
    promptExamples: {
      low: 'Use dynamic asymmetry, diagonal energy, and visual tension.',
      mid: 'Use balanced tension with stability and subtle movement.',
      high: 'Use static harmony with centered structure, leveled alignment, and calm permanence.',
    },
    avoidCopyingLiterally: ['Do not copy the strip composition; use only the balance principle.'],
  },
  depth: {
    id: 'depth',
    file: `${scalarImageBase}/Depth.png`,
    lowVisualNotes: ['planar compression', 'flat-lay or graphic 2D read', 'little z-axis separation'],
    highVisualNotes: ['foreground/midground/background separation', 'leading lines', 'strong spatial layering'],
    transitionNotes: [
      'Increasing depth should create stronger spatial layers and foreground interest.',
      'Decreasing depth should flatten the image toward a graphic planar read.',
    ],
    promptExamples: {
      low: 'Flatten depth with a planar, graphic, compressed spatial read.',
      mid: 'Use moderate natural depth with legible spatial layers.',
      high: 'Create strong depth with foreground interest, midground subject/product, and background separation.',
    },
    avoidCopyingLiterally: ['Do not copy calibration-strip scene content.'],
  },
  groundedness: {
    id: 'groundedness',
    file: `${scalarImageBase}/Groundedness.png`,
    lowVisualNotes: ['studio void', 'no place cues', 'object floats in brand-space'],
    highVisualNotes: ['real-world setting', 'lived-in context', 'narrative cues of use'],
    transitionNotes: [
      'Increasing groundedness should add credible real-world context and sense of place.',
      'Decreasing groundedness should remove environmental cues toward a controlled studio/void feel.',
    ],
    promptExamples: {
      low: 'Reduce environmental context toward a clean studio or void-like setting.',
      mid: 'Use enough environment to ground the product without making the frame busy.',
      high: 'Ground the image in a credible in-situ environment with narrative cues of use.',
    },
    avoidCopyingLiterally: ['Do not copy specific rooms, streets, or objects from the calibration strip.'],
  },
  presence: {
    id: 'presence',
    file: `${scalarImageBase}/Human%20Presence.png`,
    lowVisualNotes: ['product or scenery only', 'no visible humans', 'human absence as clarity'],
    highVisualNotes: ['dominant person or face', 'portrait connection', 'human scale and emotion'],
    transitionNotes: [
      'Increasing human presence should make people or faces more visible and influential.',
      'Decreasing human presence should let product, setting, or texture carry the image.',
    ],
    promptExamples: {
      low: 'Minimize human presence and let product or setting carry the frame.',
      mid: 'Include people as environmental figures rather than dominant portrait subjects.',
      high: 'Make human presence dominant with clear facial readability and emotional connection.',
    },
    avoidCopyingLiterally: ['Do not add unrelated people or identities not supported by the source.'],
  },
  gaze: {
    id: 'gaze',
    file: `${scalarImageBase}/Gaze.png`,
    lowVisualNotes: ['averted look', 'voyeuristic or internally focused', 'subject not selling directly'],
    highVisualNotes: ['direct eye contact', 'fourth-wall break', 'viewer engagement'],
    transitionNotes: [
      'Increasing gaze should move toward direct viewer engagement.',
      'Decreasing gaze should move toward averted, observed, or inward-focused feeling.',
    ],
    promptExamples: {
      low: 'Use averted gaze so the subject feels observed or internally focused.',
      mid: 'Use softly engaged gaze without fully addressing the viewer.',
      high: 'Use direct gaze into the lens for stronger viewer engagement.',
    },
    avoidCopyingLiterally: ['Do not change source identity; only adjust gaze direction when plausible.'],
  },
  valence: {
    id: 'valence',
    file: `${scalarImageBase}/Emotional%20Valence.png`,
    lowVisualNotes: ['sadness, tension, problem framing', 'cooler or darker emotional mood'],
    highVisualNotes: ['joy, comfort, satisfaction', 'warmth and optimism'],
    transitionNotes: [
      'Increasing valence should make the emotional mood more positive, comforting, or joyful.',
      'Decreasing valence should make mood more restrained, tense, or problem-oriented.',
    ],
    promptExamples: {
      low: 'Use a darker or more problem-oriented emotional tone appropriate to the brand.',
      mid: 'Keep emotional valence nuanced and restrained.',
      high: 'Shift the image toward positive warmth, satisfaction, comfort, and optimism.',
    },
    avoidCopyingLiterally: ['Do not copy emotional scenes from the strip; use only mood calibration.'],
  },
  arousal: {
    id: 'arousal',
    file: `${scalarImageBase}/Arousal.png`,
    lowVisualNotes: ['stillness', 'calm tempo', 'serenity or relaxed luxury'],
    highVisualNotes: ['movement', 'laughter or action', 'chaotic or urgent visual rhythm'],
    transitionNotes: [
      'Increasing arousal should make the image feel more energetic and active.',
      'Decreasing arousal should slow the tempo and make the scene calmer.',
    ],
    promptExamples: {
      low: 'Lower arousal with stillness, serenity, calm posture, and relaxed visual tempo.',
      mid: 'Use alert but controlled energy with subtle tension.',
      high: 'Increase arousal with movement, liveliness, and urgent visual rhythm.',
    },
    avoidCopyingLiterally: ['Do not introduce unrelated action scenes or props from the strip.'],
  },
  'stopping-power': {
    id: 'stopping-power',
    file: `${scalarImageBase}/Stopping%20Power.png`,
    lowVisualNotes: ['pastel or low contrast', 'quiet feed presence', 'gradual lines'],
    highVisualNotes: ['extreme contrast', 'pop color', 'glitch or unexpected hook'],
    transitionNotes: [
      'Increasing stopping power should strengthen immediate feed impact and visual hook.',
      'Decreasing stopping power should make the image quieter and less interruptive.',
    ],
    promptExamples: {
      low: 'Keep visual impact muted with lower contrast and quieter color.',
      mid: 'Use controlled contrast and one clear feed-readable hook.',
      high: 'Increase stopping power with stronger contrast, sharper hierarchy, and attention-grabbing pop.',
    },
    avoidCopyingLiterally: ['Do not copy strip-specific neon, glitch, or product examples literally.'],
  },
}
