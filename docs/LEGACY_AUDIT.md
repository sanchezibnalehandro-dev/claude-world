# Legacy Audit — claude-world

Branch: `refactor/foundation`  
Baseline commit: `90a87df91aeb08e8e99f1c6d87833212a2dcd593`

## What this project is

A persistent autonomous character simulation:

```
world state
  -> agent context
  -> LLM decision
  -> deterministic validation
  -> state mutation
  -> memory / diary
  -> 3D representation
  -> next cycle
```

The browser is intended to be an observer and renderer. The persistent state lives in Supabase.

## Current architecture

- `index.html`
  - UI
  - Three.js scene
  - asset loading
  - animation selection
  - world state
  - simulation rules
  - agent prompt
  - agent decision parsing
  - Supabase reads/writes
  - manual agent visit

- `api/agent.js`
  - Anthropic proxy for manual visits

- `api/cron.js`
  - autonomous agent cycle
  - reads persistent state
  - calls Anthropic
  - validates and applies decisions
  - writes state and diary

- `models/`
  - FBX character animations
  - GLB environment props

## Confirmed problems

### 1. Simulation logic is duplicated

The following logic exists in both the frontend and the cron runtime:

- decision normalization
- need updates
- intent handling
- contradiction cleanup
- resource rules
- inventory mutations
- location rules

This creates two possible versions of reality.

**Target:** one authoritative simulation engine used by manual and autonomous visits.

### 2. Frontend can mutate persistent world state

The browser directly writes to Supabase using the publishable key.

Even if RLS currently permits this intentionally, the architectural boundary is wrong for a persistent autonomous world.

**Target:** browser reads/render only; server mutates state.

### 3. Monolithic frontend

`index.html` is roughly 2200 lines and mixes rendering, simulation, persistence, prompting and UI.

**Target:** split into ES modules without changing behaviour first.

### 4. Asset inconsistencies

The code references:

- `/models/stand_river.fbx`
- `/models/pause_woods.fbx`

These files are absent from the current repository.

`models/observe_river.fbx` exists but is only 2 bytes and is therefore effectively broken.

### 5. Manual and autonomous agent contracts differ

The frontend prompt includes `action_type`; the cron prompt does not.

Visual behaviour therefore cannot be guaranteed to match autonomous decisions.

**Target:** one shared action schema.

### 6. LLM JSON parsing is fragile

Current code extracts the first `{` and last `}` from model output and then calls `JSON.parse`.

**Target:** provider-level structured output / schema validation.

### 7. Provider is hard-coded

Anthropic request logic is embedded directly in both API paths.

**Target:** provider adapter:
```
AgentProvider
  decide(context) -> AgentDecision
```

This allows OpenAI to replace Anthropic without touching simulation code.

### 8. Cron deployment configuration is not present in this repository

`api/cron.js` exists, but no Vercel cron configuration was found in the repository root.

**Target:** verify current deployment configuration before enabling autonomous execution.

### 9. Supabase security is not yet verified

The repository exposes a Supabase publishable key, which is normal for client usage.

However, RLS policies, grants and table exposure could not be verified from the current connector permissions.

**Status:** UNKNOWN, must be checked before moving writes server-side.

## Refactor rule

During foundation refactor:

> No new gameplay features and no intentional UX changes.

Every cleanup commit should preserve current observable behaviour unless explicitly documented.

## Planned cleanup sequence

1. Freeze legacy snapshot. ✅
2. Record architecture and known defects. ✅
3. Create shared domain model and decision schema. ✅
4. Extract pure simulation rules from UI and cron. ✅
5. Make server the only state mutation path.
6. Split frontend rendering/UI into modules.
7. Repair or remove broken asset references.
8. Add provider abstraction.
9. Replace Anthropic adapter with OpenAI Responses API.
10. Add automated tests for simulation rules.
11. Verify Supabase RLS/grants.
12. Verify and restore autonomous scheduling.
13. Only then add new world mechanics.

## Definition of “foundation complete”

- one simulation engine
- one decision schema
- one persistent-state mutation path
- frontend is renderer/observer
- no duplicated world rules
- provider can be swapped independently
- broken assets are accounted for
- simulation rules have tests
- legacy behaviour remains recoverable from `legacy-v1`
