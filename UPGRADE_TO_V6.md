# Quick Start: Upgraded to v6 Premium Briefings

## What Changed

Your AI Feed Digest has been upgraded from v5 to **v6 - Premium Magazine-Quality Briefings**.

### TL;DR
- ✨ **Magazine-quality prose** with narrative flow and elegant writing
- 🧠 **Deeper analysis** revealing non-obvious insights and mechanisms  
- 📈 **Longer output** ~4,600 words (was ~3,500) for truly substantial briefings
- 🎯 **Better engagement** - reads like The Economist or The Atlantic, not just news summaries

## What to Do

### 1. Test Your First v6 Briefing

```bash
npm run generate:edition
```

The generation will take **90-120 seconds** (longer than before because it's producing higher quality, longer content).

### 2. Review the Output

Check `content/editions/[today's date].md` for:

- **Opening hook**: Does it grab your attention immediately?
- **Narrative flow**: Does it read like a unified essay, not disconnected summaries?
- **Deep insights**: Are there 2-3 genuinely non-obvious observations?
- **Reading experience**: Do you feel intellectually engaged, not just informed?
- **Length**: Should be 4,000-5,000 words (12-15 minutes reading time)

### 3. Validate Quality (Optional)

```bash
npx tsx scripts/validate-briefing-quality.ts
```

This checks word counts, structure, and language consistency.

## Configuration Changes

### Updated Word Targets (`config.yml`)

```yaml
target_words:
  synthesis: 1800      # +400 words - Your opening essay
  analysis: 1200       # +300 words - Deep investigation  
  key_points: 500      # +100 words - Strategic insights
  watch_points: 400    # +100 words - Horizon scan
  curiosities: 350     # +100 words - Thought experiments
  positives: 350       # +100 words - Progress report
```

**Total**: 4,600 words (was 3,500)

### Updated Timeout

```yaml
opencode:
  timeout_ms: 120000   # 2 minutes (was 90 seconds)
```

Longer timeout allows the AI to craft sophisticated, well-reasoned content.

## What Makes v6 Better

### Before (v5): Good News Digest
- Clear, structured information
- Fact-based reporting
- Efficient summaries

### After (v6): Premium Journalism
- **Narrative craft**: Stories with hooks, arcs, elegant transitions
- **Deep mechanisms**: How and why, not just what
- **Non-obvious insights**: Challenge assumptions, reveal patterns
- **Intellectual engagement**: Thought-provoking questions and perspectives
- **Strategic foresight**: Conditional forecasts and weak signals

## Expected Quality

After reading a v6 briefing, you should feel:

1. ✅ **Genuinely more informed** (not just aware of headlines)
2. ✅ **Intellectually stimulated** (learned something non-obvious)  
3. ✅ **Better prepared** (understand what to watch and why)
4. ✅ **Engaged** (enjoyed the reading experience)
5. ✅ **Satisfied** (worth the 12-15 minutes invested)

## Troubleshooting

### Generation Takes Too Long
- **Normal**: 90-120 seconds is expected for 4,600+ words
- **If >2 minutes**: Check network connection, try again
- **Reduce timeout** if needed: Set `timeout_ms: 90000` in config.yml

### Output Too Short
- **Check model**: GPT-4 class models work best (gpt-4, gpt-4-turbo, claude-3-opus)
- **Check target_words**: Ensure values in config.yml match above
- **Review prompt**: File `src/opencode-briefing-prompt.ts` should show v6 header

### Quality Not as Expected
- **First generation**: May need one iteration as model learns your style
- **Model capability**: Smaller models struggle with this complexity—use GPT-4 class
- **Feed quality**: Premium output needs quality inputs—review your feeds.yml

## Files Changed

- ✅ `src/opencode-briefing-prompt.ts` - v6 magazine-quality instructions
- ✅ `config.yml` - Increased word targets and timeout  
- ✅ `README.md` - Updated documentation
- 📄 `DIGEST_V6_IMPROVEMENTS.md` - Full technical documentation (read this!)
- 📄 `UPGRADE_TO_V6.md` - This quick start guide

## Rollback (If Needed)

If you need to revert to v5:

```bash
git diff config.yml  # See what changed
# Manually restore old values in config.yml:
# target_words.synthesis: 1400
# target_words.analysis: 900
# target_words.key_points: 400
# target_words.watch_points: 300
# target_words.curiosities: 250
# target_words.positives: 250
# timeout_ms: 90000
```

Then restore the v5 prompt (check git history).

## Next Steps

1. **Generate first briefing**: `npm run generate:edition`
2. **Read full docs**: See `DIGEST_V6_IMPROVEMENTS.md` for philosophy and details
3. **Share feedback**: How does it compare to v5? What could improve?
4. **Tune if needed**: Adjust target_words based on your preferences

## Questions?

- **What's the philosophy?**: Read `DIGEST_V6_IMPROVEMENTS.md` section "Philosophy: Why Magazine Quality Matters"
- **How does it work?**: Check the detailed prompt in `src/opencode-briefing-prompt.ts`
- **Can I customize?**: Yes! Edit target_words in `config.yml` and tweak the prompt

---

**Enjoy your premium daily briefings!** 🎉

The goal is to create something you actually **want** to read—not just skim because you should.
