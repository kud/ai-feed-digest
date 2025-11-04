# Briefing Generation Improvements (v5)

## Changes Made

### 1. Configuration Updates (`config.yml`)

**Increased minimum word count targets** to ensure substantial, analytical output:

```yaml
target_words:
  synthesis: 1400      # was 1000 (+40%)
  analysis: 900        # was 600  (+50%)  
  key_points: 400      # was 300  (+33%)
  watch_points: 300    # was 200  (+50%)
  curiosities: 250     # was 200  (+25%)
  positives: 250       # was 200  (+25%)
```

**Total minimum**: 3,500 words (was 2,500 words)

### 2. Prompt Engineering (`src/opencode-briefing-prompt.ts`)

#### Language Enforcement
- Changed from negative instruction ("NO English") to positive framing
- Now states: "Write the entire briefing in ${language} with a refined, journalistic, analytical tone"

#### Structural Requirements

**SYNTHÈSE DU JOUR:**
- MINIMUM 5-6 substantial paragraphs
- Each paragraph must START WITH A CONCRETE FACT (no abstract preambles)
- Smooth TRANSITIONS between topics required
- FORBIDDEN: Generic phrases without specifics

**ANALYSE CRITIQUE:**
- MINIMUM 6-8 substantial paragraphs  
- 3-part analytical lens enforced:
  * Signal révélé (hidden dynamic)
  * Importance (structural implications)
  * Contre-interprétations (nuances, alternative scenarios)
- REQUIRED: Cross-theme connections
- NO FILLER text allowed

**Other Sections:**
- POINTS À RETENIR: 4-5 paragraphs minimum
- À SURVEILLER: 3-4 paragraphs minimum
- CURIOSITÉS: 3 paragraphs minimum
- POINTS POSITIFS: 3 paragraphs minimum (ALWAYS included)

#### Source Prioritization
Added explicit guidance:
- Prioritize critical and generalist sources (Le Monde, Libération, Reporterre, Futura, Mr Mondialisation, The Conversation)
- Limit lifestyle/product sources (Product Hunt, Secret London) to <10% of total content weight
- Ensure 6–12 unique sources represented across sections

#### Length Requirements
- Changed from "indicative targets" to "MANDATORY MINIMUMS"
- Explicitly states: "PRIORITY: Completeness and analytical depth over brevity"
- Instructs model to USE MORE WORDS if substantive reasoning requires it

### 3. Validation Script (`scripts/validate-briefing-quality.ts`)

Created optional post-generation validation tool that checks:

- ✅ Total word count ≥ 2,600 words (85% of 3,500 target)
- ✅ Section-level minimum word counts
- ✅ Required section presence
- ✅ Paragraph counts per section
- ⚠️  English leakage detection (heuristic-based)

**Usage:**
```bash
npx tsx scripts/validate-briefing-quality.ts [YYYY-MM-DD]
```

## Expected Output

A **3,000–3,500 word French-language editorial digest** with:

1. **Journalistic flow**: Concrete facts → causal chains → implications
2. **Critical depth**: Second-order analysis, cross-theme connections
3. **Narrative arc**: From events to analysis, ending with reflection/positives
4. **Source diversity**: 6–12 sources, prioritizing quality journalism
5. **Consistent French**: No mixed-language sections
6. **Complete structure**: All 6 required sections present with substance

## Regression Fixed

The November 3, 2025 edition had:
- ~1,100 words total (target: 2,600+)
- Mixed English/French sections  
- Minimal analysis depth
- Placeholder text in some sections

With these changes:
- Word counts enforced at configuration level
- Language consistency improved through positive framing
- Analytical requirements made explicit  
- Source prioritization prevents lifestyle content dominance
- Validation script available for quality checks

## Migration Notes

### Code Changes
- ✅ All code remains in English (as requested)
- ✅ UI/website remains in French
- ✅ Only the generated content language is controlled via config

### Backward Compatibility
- Config schema expanded (old configs still work, just use lower targets)
- Prompt structure unchanged (JSON format maintained)
- Parsing logic already handles both `snake_case` and `camelCase` keys

### Next Steps

1. Test generation with new configuration
2. Monitor word counts and section quality  
3. Adjust targets if model consistently over/under-produces
4. Consider adding validation to CI/CD pipeline

## Technical Details

### Files Modified
- `config.yml` - Increased target word counts
- `src/opencode-briefing-prompt.ts` - Enhanced prompt with structural requirements

### Files Created
- `scripts/validate-briefing-quality.ts` - Quality validation tool

### No Changes Required
- `src/summarise-with-oc.ts` - Already handles new structure
- `src/lib/types.ts` - Type definitions unchanged
- `src/lib/validate-briefing.ts` - Existing validator remains functional
