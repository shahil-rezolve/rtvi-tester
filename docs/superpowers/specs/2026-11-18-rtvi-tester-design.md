# RTVI Tester — LiveKit diagnostics console

## Context
`@rezolve-pred/rzlv-rtvi-wrapper` (v1.3.0, repo `../rtvi-wrapper`) is the React RTVI layer our voice bots use over LiveKit. Its only playground (`rtvi-wrapper/src/App.tsx`) is a bare form + `JSON.stringify` debug box. We need a standalone tester in `rtvi-tester/` that consumes the **published** package and shows everything happening on a session: connection lifecycle, every RTVI event, raw data-channel traffic both ways, Pipecat metrics, per-turn latency, and live WebRTC network stats, in a compartmentalized devtools-style UI (dark default, light supported). Audience: devs debugging latency and protocol, plus QA triage. All panels carry equal weight.

### Constraints found in the wrapper
- Public API = `RTVIProvider` / `useRTVI()` / `useRTVIEvent()` / `RTVIAudio` + protocol utils (`rtvi-wrapper/src/index.ts`). State + methods are typed in `RTVIWrapperState` (`src/types/rtvi.ts:364`); 40 events in `RTVIEvent` (`src/types/rtvi.ts:219`).
- **The LiveKit `Room` is never exposed.** Inbound data goes `room DataReceived → decodeMessage → handleMessage` (`useLiveKitTransport.ts:543`). Unknown message types are only console-logged. So raw payloads and `getStats()` can't be reached through the API.
- Room is created lazily inside `joinChatRoom` (`useLiveKitTransport.ts:403`), and livekit-client reads the global `RTCPeerConnection` when it builds each PC. Patching the global before connecting therefore catches every PC. That is the same approach rtcstats/webrtc-internals-style tools use.
- A web page **cannot open or read `chrome://webrtc-internals`** (Chrome blocks it). We rebuild that data ourselves from the patched PCs. We can export a webrtc-internals-compatible dump, and offer "copy chrome://webrtc-internals" for side-by-side checks.
- LiveKit data channels (`_reliable`, `_lossy`, `_data_track`) carry protobuf `DataPacket`. Pipecat RTVI JSON is in `value.case === 'user'` → `user.payload`. Decode it with `DataPacket.fromBinary` from `@livekit/protocol`, pinned to the version livekit-client depends on.

## Decisions (from interview)
- Transport: **LiveKit only**.
- Raw access: **intercept in the tester** (patch `RTCPeerConnection`). The wrapper stays untouched, so we test the published package as-is.
- Credentials: a **paste URL + token** form (remembered in localStorage), plus a separate **cURL runner** section. You paste a curl command, run it, and inspect the response, then copy the URL/token into the form. It has per-value copy buttons and does not auto-fill.

## Stack (from research)
| Slot | Choice |
|---|---|
| App | Vite + React 19 + TS, pnpm 11 (per existing `package.json` devEngines) |
| RTVI | `@rezolve-pred/rzlv-rtvi-wrapper`, `livekit-client`, `@livekit/krisp-noise-filter` (existing `.npmrc` handles registry auth) |
| Decode | `@livekit/protocol`, same version as livekit-client's dependency (avoids a duplicate copy) |
| UI kit | Tailwind v4 + shadcn/ui (Radix). We own the components, so dense layouts are easy |
| Panes | `react-resizable-panels` (through shadcn `Resizable`) |
| Long lists | `@tanstack/react-virtual` |
| JSON | `react-json-view-lite` |
| Charts | `uplot` with a ~30-line React wrapper (canvas, built for 1 Hz streaming) |
| State | `zustand` with capped ring buffers (events/messages 5k, stats 10 min) |
| Tests | `vitest` for pure logic only |
| Theme | `.dark` class on `<html>` + localStorage, dark by default; no theme lib |

Skipped: rtcstats-js (doesn't capture DataChannel contents and delta-compresses stats; our ~150-line patch covers it). Importing webrtc-internals dumps (YAGNI; we export compatible dumps, and the rtcstats dump-importer site can view them).

## Folder structure
```
rtvi-tester/
  vite.config.ts            # + dev-only /__proxy middleware for the cURL runner
  src/
    main.tsx                # FIRST import: diagnostics/pcInterceptor (must run before livekit)
    app/App.tsx             # RTVIProvider(transport="livekit", defaultAudioEnabled=false) + layout shell
    diagnostics/
      pcInterceptor.ts      # patched RTCPeerConnection: PC registry, ICE/SDP/state log, DataChannel send/message taps
      livekitPacket.ts      # bytes → {channel, case, json|summary}
      statsSampler.ts       # 1 Hz getStats → derived series (RTT, jitter, loss, bitrate, audio level, candidate pair)
      exportDump.ts         # session bundle JSON + webrtc-internals-compatible dump
    store/sessionStore.ts   # zustand: events, dcMessages, statsSeries, pcs, turns, selection
    rtvi/
      useEventRecorder.ts   # rtvi.on() for every RTVIEvent value → store (audio-level events → meters, not the log)
      useTurnTracker.ts     # turns: user start/stop → bot start/stop, attach Pipecat ttfb/processing
      useSessionControls.ts # mic/noise-filter reconcile pattern copied from wrapper App.tsx:60-101
    curl/parseCurl.ts       # tokenizer: url, -X, -H, -d/--data(-raw|-binary), --json, line continuations
    features/               # one folder per panel, each self-contained
      connection/  curl-runner/  controls/  composer/  turns/  events/
      data-channel/  metrics/  network/  peer-connections/  transcript/  devices/  inspector/
    components/ui/          # shadcn primitives
    lib/                    # theme.ts, format.ts (ms, bytes, kbps), uplot chart wrapper
```

## Behaviour per panel
- **Connection**: URL/token fields, Connect/Disconnect, state pill fed by `TransportStateChanged`, `error`, `connectionParams`, and a connect-duration timer.
- **cURL runner**: paste curl → parsed request preview (method/url/headers/body) → Send → shows status, timing, response headers, and the body in the JSON viewer with copy buttons. It goes through the Vite dev proxy (server-side fetch, so no CORS problems; bound to localhost). In a static build it falls back to a direct `fetch` and shows a clear CORS message.
- **Controls**: mic toggle, noise filter (intent reconcile as in the wrapper App), chat mode text/voice (mutes `RTVIAudio`), screen share, mic/speaker pickers, bot audio volume.
- **Composer**: send `send-text`; send any `RTVIMessageType` with JSON data; `sendRawData` with free JSON. Each send is logged as outbound, and the interceptor shows its wire form too.
- **Turns (signature view)**: a horizontal waterfall per turn with two lanes, user (cool teal) and bot (amber). It shows the speech spans, the gap = voice-to-voice latency, and Pipecat TTFB/processing per processor (STT/LLM/TTS) as ticks. It has p50/p95 at the top.
- **Events**: virtualized log of every RTVI event (time, +Δ, name, short summary), with filter chips and text search. Clicking a row opens it in the Inspector.
- **Data channel**: every inbound/outbound packet with direction, channel label, packet case, byte size, and decoded JSON. Non-RTVI and unparseable packets are shown too (things the wrapper drops silently).
- **Metrics**: Pipecat `metrics` events as a per-processor TTFB/processing table + sparkline.
- **Network**: uPlot charts for RTT, jitter, packet loss %, in/out bitrate, and audio level. Also shows the selected ICE candidate pair (local/remote type, protocol, relay?) and codec.
- **Peer connections**: per-PC (publisher/subscriber) chronological log (createOffer/answer SDP, ICE candidates, state changes, data channels) and a browsable raw `getStats` tree, like webrtc-internals.
- **Transcript**: conversation turns (pattern from wrapper App.tsx:110-147), with live interim text.
- **Devices & tracks**: mics/speakers, `tracks.local` / `tracks.bot` track settings and readyState.
- **Inspector**: right-hand pane showing the selected item's full JSON, with copy.
- **Top bar**: connection state, live RTT/jitter/loss chips, "Export diagnostics" (bundle + webrtc-internals-format dump), "Copy chrome://webrtc-internals", theme toggle, clear session.

## Layout
```
┌ top bar: ● connected 02:14 │ RTT 38ms  jitter 4ms  loss 0.0% │ export ▾  internals ⧉  ☾ ┐
├ rail (resizable) ─┬ Turns waterfall (resizable height) ─────────────────────────────────┤
│ Connection        │ T3  user ███████▏ 812ms ▏bot ██████████                              │
│ cURL runner       │ T4  user ████▏ 640ms ▏bot ████████████                               │
│ Controls          ├ tabs: Events | Data channel | Metrics | Network | PCs | Transcript | Devices ┬ Inspector ┤
│ Composer          │ virtualized rows / charts                                             │ { json }  │
└───────────────────┴───────────────────────────────────────────────────────────────────────┴───────────┘
```
Rail sections are collapsible. Every split is draggable, and the sizes are saved to localStorage.

## Visual direction
- Subject: an instrument for a two-party voice conversation, so colour has a meaning: **user = teal `#3FB8AF`**, **bot = amber `#E9A23B`**, used everywhere (waterfall, transcript, data-channel direction, meters). Status colours: ok `#5CC98A`, warn `#E8C14A`, bad `#E5636B`.
- Dark base: deep blue-slate `#141B26` surface, `#1B2433` raised, `#2A3547` lines, text `#D7DEE8`. Light: `#F4F6F9` / `#FFFFFF` / `#D9DFE7`, text `#1C2430`. Tokens live as CSS variables on `:root`/`.dark`.
- Type: IBM Plex Sans for UI, JetBrains Mono only for payloads/SDP and numbers (tabular figures). Sentence case and no all-caps labels.
- The waterfall is the one bold element. The rest stays quiet: hairline separators, two radii (4px controls, 8px panes), no shadows or decorative gradients. Motion only on user-triggered expand/collapse. Respect reduced motion, visible focus rings, keyboard-navigable tabs and lists.

## Implementation order
1. Scaffold Vite/React/TS, Tailwind v4, shadcn, deps; theme tokens + toggle.
2. `pcInterceptor` + `livekitPacket` + `statsSampler` + store (with unit tests).
3. Provider wiring, `useEventRecorder`, `useTurnTracker`, `useSessionControls`.
4. `parseCurl` (with tests) + vite proxy + cURL runner.
5. Panels, roughly in this order: connection → events → data channel → inspector → network → turns → metrics → PCs → transcript → devices → composer.
6. Export (bundle + dump), polish, light-theme pass, README (run instructions, the interceptor caveat).

On approval: save this design to `docs/superpowers/specs/2026-11-18-rtvi-tester-design.md`, then run writing-plans → execute. Delegate scaffolding and dependency installs to subagents.

## Verification
- `pnpm test`: vitest for `parseCurl`, `livekitPacket` (hand-built DataPacket fixtures), turn/latency derivation, and stats derivation (fixture RTCStatsReport).
- `pnpm build` (tsc + vite) and `pnpm lint` clean.
- Manual E2E against a real LiveKit/Pipecat room (needs a URL+token or a curl from you):
  - Connect.
  - Confirm events stream in.
  - Confirm the data channel shows both directions and the decoded RTVI JSON.
  - Confirm the RTT/jitter charts match `chrome://webrtc-internals` open in another tab.
  - Confirm turns show latency.
  - Export a dump and load it in the rtcstats dump-importer.
  - Check both themes with screenshots from the browser tool.
