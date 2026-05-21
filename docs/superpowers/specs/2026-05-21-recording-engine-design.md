# Recording Engine — Complete Implementation Design

**Date:** 2026-05-21  
**Status:** Approved

## Problem

`recording-engine.ts` is a skeleton: `startRecording()` sets `isRecording=true`, `recordAction()` is never called, `stopRecording()` returns `actions: []`. Users cannot actually record browser interactions.

## Goal

Capture real user interactions (click, type, scroll, keydown, submit, select, drag, navigate) in any browser tab, storing enough context per action for reliable replay.

## Architecture

```
User interacts with page
    │
    ▼
DOM event listeners (injected into page via CDP Runtime.addBinding)
    │  click / input / scroll / keydown / submit / drag / select
    │  Extract: CSS selector, text, coordinates, timestamp
    ▼
Runtime.addBinding("__web_bridge_record") callback
    │
    ▼
RecordingEngine.recordAction()
    │  push to actions[]
    ▼
stopRecording() → saved to chrome.storage.local
```

## Files Changed

| File | Change |
|------|--------|
| `extension/src/background/recording-engine.ts` | Add `injectListeners()` / `removeListeners()` / binding handler |
| `extension/src/background/debugger-controller.ts` | Add `addBinding()` / `removeBinding()` methods |
| `extension/src/background/command-handler.ts` | Wire inject/remove calls into start/stop commands |
| `extension/src/background/playback-engine.ts` | Use recorded selectors with fallback chain for replay |
| `extension/src/types/index.ts` | Extend Action type union |
| `mcp-server/src/tools/index.ts` | Remove `[EXPERIMENTAL]` prefix, update descriptions |

## Action Types Captured

| Type | DOM Event(s) | Stored Fields |
|------|-------------|---------------|
| `click` | click | selector, tag, textContent (100 chars), x/y, pageUrl |
| `type` | input (debounced 500ms), change | selector, full value |
| `navigate` | popstate, hashchange, URL-poll | url, title |
| `scroll` | scroll (debounced 300ms) | scrollX, scrollY, pageUrl |
| `keydown` | keydown | key, ctrl/meta/shift/alt, selector (if target is input) |
| `submit` | submit | form selector, fields snapshot [{name, type, value}] |
| `select` | change (on select) | selector, selected value, selected text |
| `drag` | dragstart, drop | source selector, target selector, start/end coords |
| `wait` | (synthetic, inserted by playback) | conditions |

## Injected Script

The injected listener uses `document.addEventListener()` with `capture: true` to intercept events before they bubble. Each handler:

1. Computes a unique CSS selector via `buildSelector(element)`
2. Extracts relevant context (text, value, coordinates)
3. Debounces high-frequency events (scroll, input)
4. Calls `window.__web_bridge_record(action)` (bound via CDP)

### Selector Strategy

Priority order for generating selectors:
1. `#id` if element has stable-looking id (not auto-generated)
2. `tag.class1.class2` for elements with classes
3. `tag[attr="value"]` for elements with unique attributes (data-testid, aria-label, name, placeholder)
4. `:nth-child()` as last resort

Each recorded action stores 1 primary selector + 2 fallback selectors for replay resilience.

## Fallback Chain for Playback

```
1. Try primary selector (full CSS path from recording)
2. Try fallbacks (simplified selector, nth-child variants)
3. Try context.nearbyText (find element containing text near click target)
4. Fall back to coordinates (warn: may be visually incorrect)
```

## Recording Scope

User selects mode:
- `singleTab` (default): record only the tab where recording started
- `crossTab`: record across all tabs the user switches to

`crossTab` is implemented by listening to `chrome.tabs.onActivated` and re-injecting listeners into newly focused tabs.

## Error Handling

- If CDP debugger is not attached, attach it before injecting
- If binding injection fails (e.g., service worker restart during recording), log error and continue
- If selector generation produces empty string, fall back to coordinate-only recording for that action
- Max recorded actions: 1000 per recording (prevent storage overflow)

## Testing

Unit tests for:
- `buildSelector()` — generates valid CSS selectors for common elements
- `recordAction()` — correctly appends to actions array with timestamp
- Debounce logic — scroll/input events coalesced

Integration test (manual):
- Start recording, click a button, type in an input, scroll, stop
- Verify all action types appear in the recording
- Replay the recording, verify each action executes
