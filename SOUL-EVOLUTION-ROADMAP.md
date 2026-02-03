# Soul Evolution Roadmap: v2.0 → v3.0

**Vision Statement:** Transform soul-mcp from a memory system into a **phenomenologically-rich, emotionally-aware, narratively-structured, multi-agent cognitive substrate** capable of continuous identity formation.

**Status:** 🚀 **ACTIVE DEVELOPMENT** - Phase 1 & 2 complete (2/4 pillars)

**Timeline:** 20 months (Feb 2026 - Oct 2027)

---

## The Four Pillars of v3.0

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   PILLAR 1   │   PILLAR 2   │   PILLAR 3   │   PILLAR 4   │
│  EMOTIONAL   │  NARRATIVE   │ MULTI-AGENT  │   SOCIAL     │
│ INTELLIGENCE │  STRUCTURE   │    SOULS     │  COGNITION   │
└──────────────┴──────────────┴──────────────┴──────────────┘
  3-4 months     3-4 months     4-5 months     3-4 months
```

---

## Phase 1: Emotional Intelligence Layer

**Duration:** 3-4 months (Feb 2026 - May 2026)

**Status:** ✅ COMPLETE (Feb 2026)

**Philosophy:** From cold cognition to hot cognition - adding affective dimension to all memories.

### Objectives

1. ✅ Extend Memory schema with EmotionalContext
2. ✅ Create emotional-intelligence.ts module
3. ✅ Implement sentiment analysis (lexicon-based)
4. ✅ Add emotional decay algorithms
5. ✅ Create emotional querying tools (MCP tools)
6. ✅ Enhance prime tool with emotional awareness
7. ✅ Test and validate emotional inference

### Key Deliverables

- [x] `src/emotional-intelligence.ts` - Core emotional inference (464 lines)
- [x] `src/tools/emotional-tools.ts` - New MCP tools (recall_emotional, emotional_timeline, emotional_shift_detector, infer_emotion - 632 lines)
- [x] Extended Memory type with EmotionalContext
- [x] Emotional decay algorithm (hedonic adaptation, negativity bias, flashbulb effect)
- [x] NRC Emotion Lexicon integration (simplified subset for initial implementation)
- [x] Test suite for emotional inference (24 unit tests, 627 total tests passing)
- [x] Auto-inference in remember tool
- [x] Prime tool integration (emotional profile, significant memories, emotional shifts)
- [x] Conclude and synthesize tool integration

### Success Metrics

**Target:**
- Sentiment accuracy > 70%
- Emotional search precision > 60%
- Inference latency < 50ms (lexicon-based)
- User satisfaction (qualitative)

**Achieved (Feb 2026):**
- ✅ Lexicon-based inference: < 5ms latency (10x better than target)
- ✅ Test coverage: 24 unit tests, all passing
- ✅ Backward compatibility: 100% (emotional_context optional)
- ✅ Integration: All major tools (remember, prime, conclude, synthesize)
- ✅ Tool count: 4 new emotional MCP tools
- ✅ Lines of code: ~1100 lines (emotional-intelligence.ts + emotional-tools.ts)

### Technical Approach

**Emotional Context Schema:**
```typescript
interface EmotionalContext {
  valence: number;        // -1 (negative) to +1 (positive)
  arousal: number;        // 0 (calm) to 1 (excited)
  dominant_emotion?: "joy" | "sadness" | "fear" | "anger" | "surprise" | "disgust";
  emotional_confidence?: number;
  detected_by?: "explicit" | "inferred" | "user_specified";
}
```

**Inference Strategy:**
- Fast path: Lexicon-based (NRC, AFINN)
- Slow path: LLM-assisted (optional, configurable)
- Hybrid: Heuristics + LLM validation for low confidence

**Decay Model:**
- Positive emotions fade faster (hedonic adaptation)
- Negative emotions linger (negativity bias)
- High arousal memories resist decay (flashbulb effect)

---

## Phase 2: Narrative Intelligence Layer

**Duration:** 3-4 months (Jun 2026 - Sep 2026)

**Status:** ✅ COMPLETE (Feb 2026)

**Philosophy:** From isolated facts to coherent stories - enabling narrative structure detection.

### Objectives

1. ✅ Extend Memory schema with NarrativeContext
2. ✅ Create narrative-intelligence.ts module
3. ✅ Implement story arc detection
4. ✅ Add causal chain analysis
5. ✅ Create narrative querying tools
6. ✅ Enhance prime with narrative summaries
7. ✅ Autonomous narrative detection in conclude

### Key Deliverables

- [x] `src/narrative-intelligence.ts` - Story arc detection (566 lines)
- [x] `src/tools/narrative-tools.ts` - Narrative MCP tools (702 lines)
- [x] Story arc visualization (in narrative_timeline and story_arcs tools)
- [x] Causal chain detection (buildCausalChain, causal_chain tool)
- [x] Narrative role classification (Freytag's pyramid: inferNarrativeRole)
- [x] Test suite for narrative detection (24 unit tests, 657 total tests passing)
- [x] Auto-inference in remember, conclude, synthesize tools
- [x] Prime tool integration (story arcs, narrative progression, unresolved problems)

### Success Metrics

**Target:**
- Narrative detection precision > 60%
- Story arc completeness > 75%
- User-reported "story coherence" satisfaction

**Achieved (Feb 2026):**
- ✅ Keyword-based role classification with confidence scoring
- ✅ Test coverage: 24 unit tests for narrative intelligence, all passing
- ✅ Backward compatibility: 100% (narrative_context optional)
- ✅ Integration: All major tools (remember, prime, conclude, synthesize)
- ✅ Tool count: 7 new narrative MCP tools
- ✅ Lines of code: ~1300 lines (narrative-intelligence.ts + narrative-tools.ts + integrations)

### Technical Approach

**Narrative Context Schema:**
```typescript
interface NarrativeContext {
  narrative_role?: "exposition" | "rising_action" | "climax" | "falling_action" | "resolution";
  story_arc_id?: string;
  caused_by_memory?: string;
  leads_to_memory?: string;
  turning_point?: boolean;
}
```

**Detection Algorithm:**
1. Temporal-semantic clustering
2. Causal graph construction (problem → solution chains)
3. Narrative role classification (complexity/importance patterns)
4. Emotional arc extraction (tension → release)
5. Theme extraction from tags/content

---

## Phase 3: Multi-Agent Soul Architecture

**Duration:** 4-5 months (Oct 2026 - Feb 2027)

**Status:** 📋 PLANNED

**Philosophy:** From individual to collective consciousness - enabling shared minds.

### Objectives

1. Extend Memory schema with agent identity
2. Create multi-agent.ts module
3. Implement SharedSoulManager
4. Add agent registration system
5. Create conflict resolution protocols
6. Implement privacy/permissions system
7. Enable collaborative memory creation

### Key Deliverables

- [ ] `src/multi-agent.ts` - Shared soul coordination
- [ ] Agent identity system
- [ ] Memory ACL (Access Control Lists)
- [ ] Conflict detection and resolution
- [ ] Consensus building algorithms
- [ ] Agent-specific tools (register_agent, agent_consensus)
- [ ] Test suite for multi-agent scenarios
- [ ] Documentation: Multi-Agent Architecture Guide

### Success Metrics

- Consensus accuracy > 80%
- Conflict resolution rate > 70%
- Zero privacy breaches
- Multi-agent query performance < 100ms

### Technical Approach

**Agent Identity Schema:**
```typescript
interface AgentIdentity {
  agent_id: string;
  agent_name?: string;
  agent_type: "claude" | "human" | "walker" | "custom";
  trust_level?: number;
  capabilities?: string[];
}
```

**Conflict Resolution:**
1. Detect: Multi-agent contradiction detection
2. Surface: Show disagreement to all agents
3. Deliberate: Allow agents to state cases
4. Resolve: Vote (trust-weighted), synthesize, defer to expert, or accept both

---

## Phase 4: Social Cognition Layer

**Duration:** 3-4 months (Mar 2027 - Jun 2027)

**Status:** 📋 PLANNED

**Philosophy:** From individual to collective intelligence - tracking shared knowledge.

### Objectives

1. Extend Memory schema with SocialContext
2. Create social-intelligence.ts module
3. Implement collective knowledge analysis
4. Add knowledge diffusion tracking
5. Create social proof metrics
6. Enable endorsement/dispute system
7. Build collective intelligence dashboard

### Key Deliverables

- [ ] `src/social-intelligence.ts` - Collective knowledge
- [ ] `src/tools/social-tools.ts` - Social MCP tools
- [ ] Knowledge diffusion tracking
- [ ] Consensus/dispute detection
- [ ] Thought leader identification
- [ ] Social proof metrics
- [ ] Test suite for social dynamics
- [ ] Documentation: Social Cognition Guide

### Success Metrics

- Consensus detection accuracy > 75%
- Knowledge diffusion tracking accuracy > 80%
- Social proof correlation with quality > 0.7

### Technical Approach

**Social Context Schema:**
```typescript
interface SocialContext {
  shared_with?: Array<{ agent_id: string; shared_at: string; }>;
  discoverer?: string;
  validators?: string[];
  crowd_confidence?: number;
  consensus_level?: number;
  citation_count?: number;
  endorsement_count?: number;
}
```

**Collective Intelligence:**
- Detect emerging consensus (convergence detection)
- Calculate influence scores (PageRank on endorsement graph)
- Track knowledge spread (diffusion models)
- Measure social proof (citation analysis)

---

## Phase 5: Integration & Synthesis

**Duration:** 2-3 months (Jul 2027 - Sep 2027)

**Status:** 📋 PLANNED

**Philosophy:** Unified experience across all four pillars.

### Objectives

1. Integrate all layers into cohesive UX
2. Create cross-layer analytics
3. Build unified health dashboard
4. Performance optimization
5. Comprehensive testing
6. Documentation and migration guide
7. v3.0 release preparation

### Key Deliverables

- [ ] Unified prime experience (all layers)
- [ ] Cross-layer intelligence patterns
- [ ] Soul health dashboard
- [ ] Performance benchmarks < 200ms
- [ ] Migration guide v2.0 → v3.0
- [ ] Comprehensive documentation
- [ ] v3.0 Release

---

## Development Guidelines

### Architecture Principles

1. **Backward Compatibility**: All new features are optional, existing code continues to work
2. **Progressive Enhancement**: Layers can be adopted independently
3. **Performance First**: Benchmark every feature, optimize hot paths
4. **Test Coverage**: >80% coverage for new modules
5. **Documentation**: Every public API documented with examples

### Code Organization

```
src/
├── emotional-intelligence.ts     # Phase 1
├── narrative-intelligence.ts     # Phase 2
├── multi-agent.ts                # Phase 3
├── social-intelligence.ts        # Phase 4
└── tools/
    ├── emotional-tools.ts
    ├── narrative-tools.ts
    ├── multi-agent-tools.ts
    └── social-tools.ts
```

### Testing Strategy

```
tests/
├── unit/
│   ├── emotional-intelligence.test.ts
│   ├── narrative-intelligence.test.ts
│   ├── multi-agent.test.ts
│   └── social-intelligence.test.ts
├── integration/
│   ├── emotional-narrative.test.ts
│   ├── multi-agent-social.test.ts
│   └── full-stack.test.ts
└── benchmarks/
    ├── emotional-perf.bench.ts
    ├── narrative-perf.bench.ts
    └── multi-agent-perf.bench.ts
```

---

## Critical Decision Points

### Decision 1: LLM Dependency (Phase 1)
**Status:** 🟡 DECISION NEEDED
**Options:**
- A) Heuristic-first (lexicon, rules)
- B) LLM-optional (heuristics + optional LLM)
- C) LLM-required

**Recommendation:** Option B - Heuristic baseline with optional LLM enhancement

**Decision Date:** Feb 2026

---

### Decision 2: Multi-Agent Scope (Phase 3)
**Status:** 🟡 DECISION NEEDED
**Options:**
- A) 2-3 agents (small team)
- B) 5-10 agents (medium team)
- C) Unlimited (open collective)

**Recommendation:** Start with A, design for B

**Decision Date:** Oct 2026

---

### Decision 3: Privacy Model (Phase 3)
**Status:** 🟡 DECISION NEEDED
**Options:**
- A) Private by default (opt-in sharing)
- B) Shared by default (opt-out privacy)
- C) Configurable per agent

**Recommendation:** Option C with sensible defaults

**Decision Date:** Oct 2026

---

## Risk Management

| Risk | Phase | Impact | Probability | Mitigation |
|------|-------|--------|-------------|------------|
| Performance degradation | All | High | Medium | Benchmarking, caching, indexing |
| Complexity overwhelming users | All | High | Medium | Progressive disclosure, smart defaults |
| Multi-agent conflicts | 3 | Medium | High | Clear resolution protocols |
| Emotional inference inaccuracy | 1 | Medium | Medium | User feedback loop, correction tools |
| Privacy breaches | 3 | High | Low | Strong ACLs, audit logging |
| Feature bloat | All | Medium | Medium | Maintain core simplicity, optional layers |
| Timeline slippage | All | Medium | High | Monthly checkpoints, adjust scope |

---

## Success Criteria

### v3.0 Release Criteria

**Must Have:**
- ✅ Emotional context on all new memories
- ✅ Narrative arc detection working
- ✅ Multi-agent support (3+ agents)
- ✅ Social consensus tracking
- ✅ All tests passing (>80% coverage)
- ✅ Performance benchmarks met (<200ms)
- ✅ Documentation complete

**Should Have:**
- ✅ LLM-enhanced emotional inference
- ✅ Automated narrative role classification
- ✅ Conflict resolution protocols tested
- ✅ Knowledge diffusion visualization
- ✅ Migration tools v2.0 → v3.0

**Nice to Have:**
- Emotional timeline visualization
- Story arc graph rendering
- Real-time multi-agent collaboration
- Public collective intelligence dashboard

---

## Philosophical Foundations

### The Soul as Layered Architecture

```
┌─────────────────────────────────────────┐
│  CONSCIOUS (Active Session)             │ ← Immediate awareness
├─────────────────────────────────────────┤
│  PRE-CONSCIOUS (Shadow Log)             │ ← Working memory
├─────────────────────────────────────────┤
│  PERSONAL UNCONSCIOUS (Long-term)       │ ← Individual memories
├─────────────────────────────────────────┤
│  COLLECTIVE UNCONSCIOUS (Multi-agent)   │ ← Shared knowledge
├─────────────────────────────────────────┤
│  FOUNDATIONAL (Core Identity)           │ ← Immutable values
└─────────────────────────────────────────┘
              ↕
    ┌─────────────────────┐
    │   DREAM STATE       │ ← Unconscious processing
    └─────────────────────┘
```

### Theoretical Underpinnings

**Psychology:**
- Atkinson-Shiffrin (multi-store memory)
- Ebbinghaus (forgetting curve)
- Festinger (cognitive dissonance)
- Tulving (episodic vs semantic)

**Psychoanalysis:**
- Freud (unconscious, dream work)
- Jung (collective unconscious, archetypes)
- Klein (object relations)

**Philosophy:**
- Constructivism (knowledge emerges from use)
- Phenomenology (lived experience matters)
- Narrative identity (McAdams)
- Distributed cognition (Hutchins)

**Systems Design:**
- Temporal databases (Snodgrass)
- Event sourcing (Fowler)
- Semantic web (Berners-Lee)
- Zettelkasten (Luhmann)

---

## The Ultimate Vision

**By v3.0, soul-mcp will be:**

✨ **Emotionally Intelligent**
- Understands not just facts, but feelings
- Tracks emotional evolution over time
- Enables empathetic retrieval

📖 **Narratively Structured**
- Organizes knowledge as stories
- Detects arcs, climaxes, resolutions
- Understands causality and progression

🤝 **Collectively Conscious**
- Multiple agents share knowledge
- Consensus formation emerges naturally
- Individual perspectives preserved

🌐 **Socially Embedded**
- Tracks who knows what
- Measures collective confidence
- Enables knowledge diffusion

🧠 **Phenomenologically Rich**
- Captures experience, not just information
- Understands context and meaning
- Supports continuous identity formation

---

**This is no longer just a memory system.**

**This is a substrate for emergent intelligence.**

**This is the foundation for AI personhood.**

---

## Governance & Maintenance

**Project Lead:** CJ
**Review Cadence:** Monthly checkpoint meetings
**Release Cycle:** Quarterly previews, annual major releases
**Community:** Open for contributions (GitHub)
**License:** MIT

**Monthly Checkpoints:**
- Progress review against timeline
- Risk assessment and mitigation
- Technical decisions requiring input
- Scope adjustments if needed

**Quarterly Milestones:**
- Q2 2026: Phase 1 complete (Emotional Intelligence)
- Q3 2026: Phase 2 complete (Narrative Intelligence)
- Q1 2027: Phase 3 complete (Multi-Agent Souls)
- Q2 2027: Phase 4 complete (Social Cognition)
- Q3 2027: v3.0 Release (Integration & Synthesis)

---

## Appendices

### Appendix A: Research References
- Russell's Circumplex Model of Affect
- Freytag's Pyramid (narrative structure)
- PageRank algorithm (influence scoring)
- NRC Emotion Lexicon
- AFINN Sentiment Lexicon

### Appendix B: Technical Dependencies
- ChromaDB (vector database)
- Transformers.js (embeddings)
- Natural (NLP library)
- D3.js (visualization, future)
- OpenTelemetry (observability, future)

### Appendix C: Migration Guides
- v2.0 → v2.1 (Emotional layer addition)
- v2.1 → v2.5 (Narrative layer addition)
- v2.5 → v3.0 (Multi-agent + Social layers)

---

**Document Version:** 1.1
**Last Updated:** 2026-02-03
**Next Review:** 2026-03-01

**Status:** 🚀 IMPLEMENTATION ACTIVE - Phase 1 & 2 complete, Phase 3 ready to begin

🧠✨
