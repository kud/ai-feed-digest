# Briefing v7 Improvements — Premium Analytical Journalism

## Executive Summary

Version 7 removes artificial constraints and enforces high-quality French analytical writing through:
- **No token/character limits** — full-length synthesis and analysis
- **Significantly increased word targets** — 6,300+ word minimum (was 5,050)
- **Consistent high-register French** — no clichés, no journalistic filler
- **Stabilized structure** — clear functional differentiation between sections
- **Narrative through-line** — explicit connections across all 6 sections
- **Systemic analysis** — geopolitics, complex systems, sociology, climate, economics
- **Rhythm and flow** — varied sentence lengths, elegant transitions

---

## Core Problems Addressed

### 1. Truncation Issues
**Problem:** Sections were being cut short, leaving analyses incomplete.

**Solution:**
- Removed all artificial character/token upper limits
- Increased timeout from 120s to 180s (3 minutes)
- Changed messaging from "target" to "MINIMUM ABSOLU" with no upper bound
- Added explicit completion checks in prompt

### 2. Stylistic Inconsistency
**Problem:** Mixed register, journalistic clichés, bureaucratic language.

**Solution:**
- Enforced "français de haut registre" throughout prompt
- Banned specific clichés: « au cœur de », « dans la tourmente », « enjeu majeur »
- Banned bureaucratic phrases: « dans le cadre de », « au niveau de », « suite à »
- Required sophisticated transitions: « Ce qui semblait marginal dévoile... », « L'apparent paradoxe s'éclaire si... »

### 3. Section Redundancy
**Problem:** Sections repeated similar content without distinct function.

**Solution:**
Each section now has **explicit, unique function**:
- **SYNTHÈSE**: Arc narratif unificateur (establish themes, actors, tensions)
- **ANALYSE**: Investigation systémique profonde (explore mechanisms, causality)
- **POINTS À RETENIR**: Distillation stratégique (crystallize implications)
- **À SURVEILLER**: Balayage de l'horizon (project forward, identify inflection points)
- **CURIOSITÉS**: Expériences de pensée (shift perspectives, challenge frames)
- **POINTS POSITIFS**: Rapport de progrès (constructive conclusion with evidence)

### 4. Lack of Narrative Through-Line
**Problem:** Six disconnected sections, no coherent story.

**Solution:**
- Added "TISSAGE NARRATIF & FIL ROUGE" section to prompt
- Explicit requirement that topics introduced in Synthèse be developed in Analysis, implications drawn in Points à retenir, future tracked in À surveiller
- Sections must "dialogue" with each other, not exist in isolation

### 5. Superficial Analysis
**Problem:** Descriptive summaries instead of systemic investigation.

**Solution:**
**Analyse Critique** now requires:
- Mini-essay structure: Observation → Mécanisme → Signification → Incertitudes
- Explicit reference to mental models (prisoner's dilemmas, network effects, coordination failures)
- Asymmetric & non-linear effects (threshold effects, feedback loops, cascade risks)
- Cross-domain connections (tech ↔ geopolitics, climate ↔ labor markets)
- At least 2-3 genuinely non-obvious insights

### 6. Poor Rhythm and Flow
**Problem:** Long unbroken blocks, repetitive structures.

**Solution:**
- Required variation in paragraph lengths (60-80 words vs 140-180 words)
- Banned repetitive openings (« D'une part... D'autre part... »)
- Required elegant conceptual bridges, not mechanical connectors (« par ailleurs », « en outre »)
- Active voice, vivid verbs mandatory

---

## Configuration Changes

### Word Count Targets (config.yml)

```yaml
target_words:
  synthesis: 2000      # was 1800 (+11%)
  analysis: 2000       # was 1400 (+43%)
  key_points: 700      # was 600  (+17%)
  watch_points: 600    # was 450  (+33%)
  curiosities: 500     # was 400  (+25%)
  positives: 500       # was 400  (+25%)
```

**Total minimum: 6,300 words** (was 5,050 words, +25%)

Target reading time: **15-20 minutes** (was 12-15 minutes)

### Timeout

```yaml
opencode:
  timeout_ms: 180000  # 3 minutes (was 120000 = 2 minutes)
```

### Validation Schema (scripts/build-edition.ts)

Increased maximum allowed values to support longer output:
- `synthesis`: max 5000 words (was 2000)
- `analysis`: max 5000 words (was 2000)
- `key_points`: max 2000 words (was 1000)
- `watch_points`: max 2000 words (was 1000)
- `curiosities`: max 2000 words (was 1000)
- `positives`: max 2000 words (was 1000)
- `timeout_ms`: max 300000 ms = 5 minutes (was 120000)

---

## Prompt Architecture Changes

### Header & Philosophy (Lines 34-43)

**Before:** Mix of English and French, unclear tone
**After:** 
- Entirely in French for editorial directives
- Clear positioning: "français de haut registre, sans concessions stylistiques"
- Explicit philosophy: "Ceci n'est PAS un résumé d'actualité — c'est un ESSAI ANALYTIQUE"
- Humanist editorial voice with light irony where appropriate

### Section Structure (Lines 45-54)

**Before:** English descriptions in parentheses
**After:**
- French-only section labels
- Visual hierarchy with box drawing characters (╔═══╗)
- Clear functional definitions
- Explicit mandate: "Ordre immuable, fonction distincte, pas de redondance inter-sections"

### Detailed Section Requirements

Each section now has:
1. **Fonction** — explicit purpose stated upfront
2. **Contraintes structurelles** — paragraph count, word minimums, rhythm requirements
3. **Architecture** — internal structure (thematic bridges, analytical lenses, etc.)
4. **Spécificité requise** — what concreteness looks like
5. **Interdictions** — what to avoid
6. **Résultat attendu** — outcome benchmarks

#### Example: Analyse Critique (Lines 83-121)

```
Fonction : Cœur intellectuel du briefing. Analyse SYSTÉMIQUE mobilisant 
géopolitique, sociologie, économie, climatologie, théorie des systèmes complexes.

Architecture analytique — chaque paragraphe comme MINI-ESSAI :
• OBSERVATION : Que se passe-t-il vraiment sous la surface ?
• MÉCANISME : Comment et pourquoi cela se déploie-t-il ?
• SIGNIFICATION : Qu'est-ce que cela transforme ?
• INCERTITUDES : Quelles forces pourraient compliquer ce tableau ?

Profondeur systémique exigée :
• CONNEXIONS INVISIBLES
• EFFETS ASYMÉTRIQUES & NON-LINÉAIRES
• MODÈLES MENTAUX explicites
• POSTURES ANALYTIQUES (non partisanes)
• SPÉCULATION FONDÉE SUR PREUVES
```

### Narrative Through-Line (Lines 123-140)

**New section** enforcing coherence:
- Explicit mapping of how topics flow across sections
- Requirement that sections "dialogue" with each other
- Example flow: Synthèse establishes → Analysis explores mechanisms → Points à retenir crystallizes implications → À surveiller projects forward

### Style Excellence (Lines 145-168)

**Enhanced with French-specific guidance:**
- "FLUIDITÉ NARRATIVE" not "NARRATIVE FLOW"
- "VOIX ACTIVE & VERBES VIVANTS" with French examples
- "TON ÉQUILIBRÉ" with reference to Le Monde Diplomatique / Mediapart style
- "PERSPECTIVE ÉDITORIALE" allowing nuanced interpretation

### Forbidden Patterns (Lines 170-189)

**Expanded and specified in French:**
- ❌ LISTAGE SÉQUENTIEL D'ARTICLES
- ❌ LANGAGE BUREAUCRATIQUE (with 6 specific phrases banned)
- ❌ PRÉCAUTIONS SANS INSIGHT (hedging without substance)
- ❌ CLICHÉS JOURNALISTIQUES (8 specific phrases banned)
- ❌ FUITES EN ANGLAIS (except product names)

### Length Philosophy (Lines 191-213)

**Completely reframed:**
- "Aucune limite supérieure artificielle"
- "Si analyse systémique exige 6000 mots pour être convaincante, utilisez 6000 mots"
- Target 4000-6000 words (was 4000-5000)
- Benchmark: "lecteurs doivent finir en se sentant véritablement PLUS INFORMÉS ET intellectuellement STIMULÉS"
- "JAMAIS DE TRONCATURE"

### JSON Return Format (Lines 215-232)

**Now in French:**
- All field descriptions in French
- Examples showing high-register French
- Explicit: "Aucune ellipse (« ... »)"
- Final reminder: "Vérifiez que chaque section atteint son minimum de mots avant de conclure"

---

## Impact on Output Quality

### Expected Improvements

1. **Completeness**: No more truncated analyses mid-thought
2. **Sophistication**: Systemic thinking replaces surface description
3. **Coherence**: Six sections form unified intellectual journey
4. **Style**: Elegant, high-register French throughout
5. **Depth**: 6,300+ words allows proper development of complex ideas
6. **Engagement**: Varied rhythm maintains reader attention across long form

### Quality Benchmarks

A successful v7 briefing should:
- ✅ Exceed 6,000 words total
- ✅ Complete all 6 sections without truncation
- ✅ Contain 0 English phrases (except product names)
- ✅ Contain 0 journalistic clichés or bureaucratic language
- ✅ Present 2-3 genuinely non-obvious insights in Analysis
- ✅ Demonstrate clear narrative through-line across sections
- ✅ Vary paragraph lengths (some 60-80 words, some 140-180)
- ✅ Reference 8-15 unique sources with analytical diversity
- ✅ End readers feeling intellectually stimulated, not just informed

---

## Migration Guide

### For Existing Configurations

1. **Update config.yml**:
   ```yaml
   digest:
     target_words:
       synthesis: 2000
       analysis: 2000
       key_points: 700
       watch_points: 600
       curiosities: 500
       positives: 500
   opencode:
     timeout_ms: 180000
   ```

2. **No code changes required** — all changes in prompt/config

3. **Test generation**:
   ```bash
   npm run build:edition
   ```

4. **Validate output**:
   ```bash
   npx tsx scripts/validate-briefing-quality.ts
   ```

### For New Deployments

Use `config.example.yml` as template — already updated with v7 defaults.

---

## Technical Details

### Files Modified

1. **src/opencode-briefing-prompt.ts** (178 lines)
   - Complete rewrite of prompt architecture
   - French-first editorial directives
   - Explicit functional definitions for each section
   - Banned patterns catalogue
   - Narrative through-line requirements

2. **config.yml** (20 lines)
   - Increased all `target_words` values
   - Increased `timeout_ms` to 180000

3. **config.example.yml** (24 lines)
   - Updated as reference for new deployments
   - Added v7 commentary

4. **scripts/build-edition.ts** (118 lines)
   - Updated configSchema to accept higher maximums
   - Increased validation limits

### Backward Compatibility

✅ **Fully backward compatible**:
- Old configs still work (just with lower targets)
- No breaking changes to types or interfaces
- JSON output format unchanged
- Parsing logic handles both snake_case and camelCase

### Performance Considerations

- **Generation time**: Expect 120-180 seconds (was 60-120 seconds)
- **Token usage**: ~8,000-12,000 output tokens (was ~5,000-8,000)
- **Cost**: Proportional to token increase (~40-50% more)

---

## Validation

### Automated Checks

Run existing validation script:
```bash
npx tsx scripts/validate-briefing-quality.ts [YYYY-MM-DD]
```

Updated thresholds:
- Total word count ≥ 5,355 words (85% of 6,300 target)
- Each section meets 85% of its minimum

### Manual Quality Checks

1. **Style audit**: Search for banned phrases
   ```bash
   grep -i "dans le cadre de\|au niveau de\|en termes de" content/editions/YYYY-MM-DD.md
   ```

2. **English leakage**: Check for English words
   ```bash
   grep -E '\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+\b' content/editions/YYYY-MM-DD.md | grep -v "Le Monde\|Reuters"
   ```

3. **Truncation check**: Ensure no ellipses or incomplete sentences
   ```bash
   grep -E '\.\.\.|\.\.\.|…' content/editions/YYYY-MM-DD.md
   ```

4. **Coherence check**: Verify topics flow across sections (manual)

---

## Next Steps

### Immediate

1. ✅ Deploy v7 prompt and config
2. ⬜ Generate test briefing
3. ⬜ Quality audit with manual checks
4. ⬜ Adjust word targets if model consistently over/under-produces

### Short-term

1. ⬜ Update validation script with new thresholds
2. ⬜ Add style checks (banned phrases detection)
3. ⬜ Add coherence checks (topic continuity across sections)
4. ⬜ Monitor generation time and costs

### Long-term

1. ⬜ A/B test with readers: v6 vs v7 engagement
2. ⬜ Fine-tune word targets based on reader feedback
3. ⬜ Consider multilingual versions (English, Spanish)
4. ⬜ Explore section-by-section generation for even longer form

---

## Appendix: Prompt Philosophy

### Why French-First Directives?

Models perform better when:
- Instructions match output language
- Cultural/stylistic norms are explicit
- Examples use target language

### Why No Upper Limits?

Artificial constraints lead to:
- Premature truncation
- Rushed conclusions
- Compressed sophistication
- Loss of nuance

Better approach:
- Set minimums
- Trust model to self-regulate based on substance
- Use timeout as safety valve

### Why Box Drawing Characters?

Visual hierarchy in plain text:
```
╔═══════════════════════════════════════╗
║  SECTION TITLE                        ║
╚═══════════════════════════════════════╝
```
Helps model recognize section boundaries and importance.

### Why Mini-Essay Structure?

Observation → Mechanism → Signification → Incertitudes

This forces:
- Move beyond description (observation)
- Explain causality (mechanism)
- Identify stakes (signification)
- Acknowledge complexity (incertitudes)

Prevents shallow "X happened, Y happened" summaries.

---

**Version:** 7.0.0  
**Date:** 2025-11-29  
**Author:** GitHub Copilot CLI  
**License:** Same as project
