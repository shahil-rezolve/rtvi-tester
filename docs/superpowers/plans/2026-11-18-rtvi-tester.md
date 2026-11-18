# RTVI Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A LiveKit-only RTVI diagnostics console that uses the published `@rezolve-pred/rzlv-rtvi-wrapper` and shows events, raw data-channel traffic, Pipecat metrics, per-turn latency and webrtc-internals-style stats.

**Architecture:** A patched global `RTCPeerConnection`, installed before anything else runs, captures every PC, its ICE/SDP log and its data-channel bytes. Those go into a zustand store together with every RTVI event recorded via `rtvi.on`. A 1 Hz sampler derives network series from `getStats`. Pure logic (curl parsing, packet decode, stats derivation, turn reducer, dump export) is unit-tested. Panels are thin views over the store.

**Tech Stack:** Vite 8, React 19, TypeScript ~5.9, pnpm 11.8, Tailwind 4.3 + shadcn 4.23, react-resizable-panels 4, @tanstack/react-virtual 3, react-json-view-lite 2, uplot 1.6, zustand 5, vitest 5, livekit-client 2.24.1, @livekit/protocol 1.53.0.

**Spec:** `docs/superpowers/specs/2026-11-18-rtvi-tester-design.md`

## Global Constraints
- LiveKit only. `RTVIProvider transport="livekit" defaultAudioEnabled={false}`.
- `@livekit/protocol` is pinned to **1.53.0**, the version livekit-client 2.24.1 depends on.
- The interceptor import is the **first line** of `src/main.tsx`.
- Ring buffers: events and data-channel messages are capped at **5000**; stats series at **600 samples per PC** (10 min at 1 Hz).
- Colour tokens:
  - user teal `#3FB8AF`, bot amber `#E9A23B`.
  - ok `#5CC98A`, warn `#E8C14A`, bad `#E5636B`.
  - dark: `#141B26` surface, `#1B2433` raised, `#2A3547` line, `#D7DEE8` text.
  - light: `#F4F6F9`, `#FFFFFF`, `#D9DFE7` line, `#1C2430` text.
- Typography and shape:
  - Fonts: IBM Plex Sans for the UI, JetBrains Mono for payloads and numbers (`tabular-nums`).
  - Two radii: 4px and 8px. No shadows, no decorative gradients, sentence case, no all-caps labels.
- Dark theme is the default (`.dark` on `<html>`), and the choice is saved in localStorage key `rtvi-tester:theme`.
- Installing needs `NPM_TOKEN` from `.env` exported in the shell. `.npmrc` references it.
- Exported bundles **redact the token**, keeping only its last 6 chars (`…abc123`).

## Review Focus
1. **Interceptor loaded too late, or it breaks livekit.** Expect every PC to be captured, `instanceof RTCPeerConnection` to still hold, and static methods like `generateCertificate` to still work. Covered by the interceptor tests in Task 4.
2. **Non-RTVI or garbage data-channel packets.** Expect these to show as rows, never throw, and never be lost. Covered by the decode tests in Task 3.
3. **Reconnect in the same session.** Closed PCs stop being sampled, new PCs appear, and the turn state continues. Covered by the sampler test in Task 5 and the reducer test in Task 6.
4. **Real-world curl pastes.** These include `\`+newline continuations, single-quoted JSON with spaces, `--data-raw`, and `-u`. A curl without a URL gives a clear error. Covered by the parseCurl tests in Task 2.
5. **Secrets in exported bundles attached to tickets.** The token is redacted, in both the bundle and the dump. Covered by the export test in Task 7.

---

### Task 1: Scaffold, toolchain, theme

**Files:**
- Modify: `package.json`. Set `devEngines.packageManager.version` to exact `11.8.0`, because corepack rejects `^11.8.0`.
- Create: `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `components.json`, `.gitignore` (with `.env`, `node_modules`, `dist`).
- Create: `src/main.tsx`, `src/index.css` (Tailwind import, Google Fonts, colour tokens on `:root`/`.dark`), `src/lib/utils.ts` (`cn`), `src/lib/theme.ts`.
- shadcn components into `src/components/ui/`: button, input, textarea, tabs, resizable, select, switch, badge, tooltip, collapsible, dropdown-menu, label.

**Interfaces:**
- Produces:
  - `getInitialTheme(): 'dark'|'light'`
  - `applyTheme(t): void`
  - `useTheme(): [theme, toggle]`
  - the `@/` path alias pointing at `src/`

- [ ] Step 1: Export the env (`set -a; . ./.env; set +a`) and install the deps:
  - Runtime: react, react-dom, the wrapper, livekit-client@2.24.1, @livekit/krisp-noise-filter, @livekit/protocol@1.53.0, zustand, react-resizable-panels, @tanstack/react-virtual, react-json-view-lite, uplot, tailwindcss, @tailwindcss/vite.
  - Dev: vite, @vitejs/plugin-react, typescript@~5.9.3, vitest, eslint + typescript-eslint + react-hooks plugin, @types/react(-dom), @types/node.
- [ ] Step 2: Add the scripts `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`, and `test` (`vitest run`).
- [ ] Step 3: Initialise shadcn and add the components. Map the shadcn CSS variables onto the spec palette.
- [ ] Step 4: `getInitialTheme` returns the stored value if it is valid, otherwise `'dark'`. Call `applyTheme` in `main.tsx` before render, so the page never flashes the light theme.
- [ ] Step 5: Verify. `pnpm build` exits 0, and `pnpm dev` serves a dark placeholder page.

### Task 2: parseCurl

**Files:** Create `src/curl/parseCurl.ts`, `src/curl/parseCurl.test.ts`

**Interfaces:**
- Produces: `parseCurl(cmd: string): CurlRequest`, where `CurlRequest = { url: string; method: string; headers: Record<string,string>; body?: string }`. Throws `Error('No URL found in curl command')`.

- [ ] Step 1: Write the tests:
  - `curl https://a.io/x` → `{url:'https://a.io/x', method:'GET', headers:{}}`
  - `curl -X POST 'https://a.io' \\\n -H 'Content-Type: application/json' \\\n --data-raw '{"room": "r 1"}'` → method POST, `headers['Content-Type']==='application/json'`, `body==='{"room": "r 1"}'`
  - `-d` with no `-X` → method `POST`
  - `--json '{"a":1}'` → POST, body set, `Content-Type` and `Accept` set to `application/json`
  - `-u user:pw` → `Authorization === 'Basic ' + btoa('user:pw')`
  - Ignored flags `-s -L -k -v -i --compressed --location` don't break parsing. `--url` works.
  - Double quotes with `\"` escapes work.
  - `curl -H 'X: y'` with no URL throws `/No URL/`.
- [ ] Step 2: `pnpm test parseCurl` fails.
- [ ] Step 3: Implement. Strip `\\\r?\n` continuations. Write a shell-like tokenizer for single quotes, double quotes with backslash escapes, and bare words. Then walk the flags. The first bare `http(s)://` token is the URL.
- [ ] Step 4: Tests pass.

### Task 3: LiveKit packet decode

**Files:** Create `src/diagnostics/livekitPacket.ts`, `src/diagnostics/livekitPacket.test.ts`

**Interfaces:**
- Produces: `decodePacket(data: ArrayBuffer | Uint8Array | string): DecodedPacket`, where:
  ```ts
  type DecodedPacket =
    | { kind: 'rtvi'; packetCase: 'user'; topic?: string; participant?: string; json: { type: string; [k: string]: unknown } }
    | { kind: 'json'; packetCase: string; topic?: string; participant?: string; json: unknown }      // user payload JSON but not label 'rtvi-ai'
    | { kind: 'other'; packetCase: string; summary: unknown }                                       // non-user cases, via packet.toJson()
    | { kind: 'text'; packetCase: string; text: string }                                            // user payload not JSON, or raw string data
    | { kind: 'error'; error: string; byteLength: number }
  ```

- [ ] Step 1: Write the tests. Build fixtures with `new DataPacket({ value: { case: 'user', value: new UserPacket({ payload, topic }) }, participantIdentity }).toBinary()`:
  - An RTVI payload `{label:'rtvi-ai',type:'bot-ready',id:'1',data:{}}` → `kind 'rtvi'`, `json.type === 'bot-ready'`.
  - User JSON without the label → `'json'`.
  - A user payload `'hello'` → `'text'`.
  - A `case: 'speaker'` packet → `'other'`.
  - `new Uint8Array([255,1,2])` → `'error'` with `byteLength 3`, and no throw.
  - A string argument `'{"x":1}'` → `kind 'json'` with `packetCase 'raw-string'`.
- [ ] Step 2: The tests fail.
- [ ] Step 3: Implement with `DataPacket.fromBinary` inside try/catch, and decode the payload with `TextDecoder`.
- [ ] Step 4: The tests pass.

### Task 4: RTCPeerConnection interceptor

**Files:** Create `src/diagnostics/pcInterceptor.ts`, `src/diagnostics/pcInterceptor.test.ts`

**Interfaces:**
- Consumes: `decodePacket` (Task 3).
- Produces:
  ```ts
  type PcRole = 'publisher' | 'subscriber' | 'unknown';
  interface PcLogEntry { t: number; pcId: string; type: string; value: unknown }
  interface DcMessage { t: number; pcId: string; channel: string; dir: 'in' | 'out'; bytes: number; decoded: DecodedPacket }
  interface PcSink {
    onPcCreated(pcId: string, pc: RTCPeerConnection, config: RTCConfiguration | undefined): void;
    onPcRole(pcId: string, role: PcRole): void;
    onLog(e: PcLogEntry): void;
    onDcMessage(m: DcMessage): void;
  }
  installPcInterceptor(sink: PcSink, target: { RTCPeerConnection: typeof RTCPeerConnection } = globalThis): () => void // returns uninstall
  ```
- Log types use webrtc-internals naming: `createOffer`, `createOfferOnSuccess`, `setLocalDescription`, `setRemoteDescription`, `createAnswerOnSuccess`, `icecandidate`, `addIceCandidate`, `connectionstatechange`, `iceconnectionstatechange`, `icegatheringstatechange`, `signalingstatechange`, `datachannel`, `createDataChannel`, `close`, `track`.

- [ ] Step 1: Write the tests, using a `FakePC extends EventTarget` (with `createOffer`, `setRemoteDescription`, `createDataChannel` returning a `FakeDC extends EventTarget` with `send`, `close`, and a static `generateCertificate`):
  - After install, `new target.RTCPeerConnection({iceServers:[]}) instanceof FakePC`, and `target.RTCPeerConnection.generateCertificate === FakePC.generateCertificate`.
  - `onPcCreated` is called once, with id `pc-1`.
  - `await pc.createOffer()` → role `publisher`, plus log entries `createOffer` and `createOfferOnSuccess`.
  - `setRemoteDescription({type:'offer'})` as the first SDP step → role `subscriber`.
  - `dc = pc.createDataChannel('_reliable')`, then `dc.send(bytes)` → an `onDcMessage` with dir `out`, channel `_reliable`, and the right byte length. The original `send` is still called.
  - A `message` event dispatched on dc → `onDcMessage` with dir `in`.
  - A `datachannel` event whose `channel` is a FakeDC also gets tapped.
  - Calling uninstall restores the original constructor.
- [ ] Step 2: The tests fail.
- [ ] Step 3: Implement it as `class Patched extends Original`. Copy the statics, wrap the prototype methods per instance, use `addEventListener` for the state events, and tap `RTCDataChannel` instances. Handle a Blob payload with `await blob.arrayBuffer()`. Default `pcId` = `pc-${n}`.
- [ ] Step 4: The tests pass.

### Task 5: Stats derivation and sampler

**Files:** Create `src/diagnostics/stats.ts`, `src/diagnostics/stats.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Counters { t: number; bytesIn: number; bytesOut: number; packetsLost: number; packetsReceived: number }
  interface StatsSample { t: number; pcId: string; rttMs?: number; jitterMs?: number; lossPct?: number; inKbps?: number; outKbps?: number;
    levelIn?: number; levelOut?: number; pair?: { local: string; remote: string; protocol?: string; relay: boolean }; codec?: string }
  deriveSample(pcId: string, report: Map<string, any>, prev: Counters | undefined, t: number): { sample: StatsSample; counters: Counters }
  startSampler(getPcs: () => Map<string, RTCPeerConnection>, onReport: (pcId: string, report: RTCStatsReport, sample: StatsSample) => void, intervalMs = 1000): () => void
  ```

- [ ] Step 1: Write the tests with a fixture report containing these stats:
  - `transport` with `selectedCandidatePairId: 'CP1'`
  - `candidate-pair` CP1 with `currentRoundTripTime: 0.038`, `bytesReceived: 20000`, `bytesSent: 10000`, `localCandidateId`, `remoteCandidateId`
  - `local-candidate` with `candidateType: 'host'`, `protocol: 'udp'`
  - `remote-candidate` with `candidateType: 'relay'`
  - `inbound-rtp` audio with `jitter: 0.004`, `packetsLost: 2`, `packetsReceived: 98`, `audioLevel: 0.3`, `codecId: 'C1'`
  - `codec` C1 with `mimeType: 'audio/opus'`

  The first call (no prev) gives `rttMs 38`, `jitterMs 4`, `codec 'audio/opus'`, `pair.relay true`, and `inKbps` undefined. A second call with prev `{t: t-1000, bytesIn: 10000, bytesOut: 5000, packetsLost: 0, packetsReceived: 0}` gives `inKbps 80`, `outKbps 40`, `lossPct 2`. When there is no `selectedCandidatePairId`, it falls back to the pair with `nominated && state==='succeeded'`.
- [ ] Step 2: Sampler test, using fake timers. A PC with `connectionState === 'closed'` is skipped, and `getStats` is not called on it.
- [ ] Step 3: The tests fail. Implement. The tests pass.

### Task 6: Turn reducer

**Files:** Create `src/rtvi/turns.ts`, `src/rtvi/turns.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface TurnMetric { processor: string; kind: 'ttfb' | 'processing'; valueMs: number }
  interface Turn { id: number; source: 'voice' | 'text' | 'bot'; userStart?: number; userStop?: number; textSentAt?: number;
    botStart?: number; botStop?: number; userText: string; botText: string; metrics: TurnMetric[] }
  type TurnInput =
    | { type: 'userStartedSpeaking' | 'userStoppedSpeaking' | 'botStartedSpeaking' | 'botStoppedSpeaking'; t: number }
    | { type: 'userTranscript'; t: number; text: string; final: boolean }
    | { type: 'botTtsText'; t: number; text: string }
    | { type: 'textSent'; t: number; text: string }
    | { type: 'metrics'; t: number; data: PipecatMetricsData }
  turnReducer(turns: Turn[], input: TurnInput): Turn[]
  turnLatencyMs(turn: Turn): number | undefined   // botStart - (userStop ?? textSentAt)
  percentile(values: number[], p: number): number | undefined
  ```

- [ ] Step 1: Write the tests:
  - A voice turn at times start 0, stop 1000, botStart 1812, botStop 4000 → latency `812`.
  - `textSent` at t=0 and botStart at 640 → a text turn with latency `640`.
  - `botStartedSpeaking` with no open turn → a turn with `source: 'bot'` and latency undefined.
  - A second `userStartedSpeaking` after the previous turn's botStart → a new turn.
  - `userStartedSpeaking` again before botStart (the user resumes) → the same turn, with userStop cleared.
  - A final transcript appends to `userText`. `botTtsText` appends to `botText` with a space.
  - Metrics `{ttfb:[{processor:'OpenAILLMService#0',value:0.42}]}` attach to the last turn as `valueMs 420`.
  - `percentile([100,200,300,400], 50) === 250` (linear), and `percentile([], 95) === undefined`.
- [ ] Step 2: The tests fail. Implement. The tests pass.

### Task 7: Store, inspectable conversion, export

**Files:** Create `src/store/sessionStore.ts`, `src/lib/inspectable.ts`, `src/diagnostics/exportDump.ts`, `src/diagnostics/exportDump.test.ts`, `src/lib/inspectable.test.ts`

**Interfaces:**
- Consumes: the types from Tasks 3–6.
- Produces:
  ```ts
  toInspectable(v: unknown): unknown  // MediaStreamTrack→{kind,id,label,readyState,enabled,muted}; MediaDeviceInfo→{deviceId,kind,label,groupId}; Error→{name,message}; Uint8Array→{bytes:n}; plain passes through
  interface EventEntry { id: number; t: number; name: string; dir?: 'in' | 'out'; args: unknown[] }
  interface PcState { id: string; role: PcRole; createdAt: number; config?: RTCConfiguration; log: PcLogEntry[]; lastReport?: Record<string, unknown>[]; samples: StatsSample[] }
  type Selection = { kind: 'event' | 'dc' | 'pclog' | 'turn' | 'curl'; value: unknown } | null
  useSession: zustand store with state { sessionStart: number; events: EventEntry[]; dc: (DcMessage & {id:number})[]; pcs: Record<string, PcState>;
    turns: Turn[]; levels: { local: number; remote: number }; interim: string; selection: Selection }
  and actions addEvent(name, args, dir?), addDc(m), pcCreated(id, config), setPcRole(id, role), addPcLog(e), addStats(pcId, report, sample),
    applyTurn(input), setLevel(which, v), setInterim(text), select(sel), clear()
  pushCapped<T>(arr: T[], item: T, cap: number): T[]
  buildBundle(state, meta: { roomUrl?: string; token?: string; userAgent: string }): object        // events, dc, turns, pcs (log+samples), meta with redacted token
  buildInternalsDump(state, userAgent: string): { getUserMedia: []; PeerConnections: Record<string, {...}>; UserAgent: string }
  redactToken(token?: string): string | undefined   // '…' + last 6 chars
  downloadJson(filename: string, data: unknown): void
  ```
- The internals dump stores each PC's `updateLog` as `{time: ISO string, type, value: string}`. Its `stats` entries are keyed `${statId}-${prop}` with `{startTime, endTime, statsType, values: JSON.stringify(number[])}`. The `stats` are built from the `addStats` history: keep the raw reports of the last 600 samples per PC.

- [ ] Step 1: Write the tests:
  - `pushCapped` keeps the last `cap` items.
  - `redactToken('abcdefghijkl') === '…ghijkl'`.
  - The bundle's JSON string does not contain the full token.
  - The internals dump has `PeerConnections['pc-1'].updateLog[0].type === 'createOffer'`, and a stat key `'CP1-currentRoundTripTime'` whose `values` parses to `[0.038, 0.04]` across two samples.
  - `toInspectable` of an `Error` gives `{name:'Error', message:'x'}`.
- [ ] Step 2: The tests fail. Implement. The tests pass.

### Task 8: cURL proxy and cURL runner panel

**Files:** Create `vite/curlProxy.ts`, `vite/curlProxy.test.ts`, `src/features/curl-runner/CurlRunner.tsx`. Modify `vite.config.ts` to register the plugin.

**Interfaces:**
- Consumes: `parseCurl` (Task 2), `useSession().select`.
- Produces:
  - `curlProxyPlugin(): Plugin`, serving `POST /__proxy` in both `configureServer` and `configurePreviewServer`.
  - `proxyRequest(req: CurlRequest, fetchImpl = fetch): Promise<ProxyResponse>`, where `ProxyResponse = { status: number; statusText: string; headers: Record<string,string>; body: string; durationMs: number }`.
  - It rejects non-`http:`/`https:` URLs with `Error('Only http(s) URLs are allowed')`.

- [ ] Step 1: Write the tests. `proxyRequest({url:'file:///etc/passwd',...})` rejects. With a stubbed fetch returning 200 and `{"url":"wss://x","token":"t"}`, the result has the status, the body text and a numeric `durationMs`.
- [ ] Step 2: The tests fail. Implement. The tests pass.
- [ ] Step 3: Build the panel:
  - A textarea and a parsed preview: a method badge, the URL, the headers, and the body. A parse error shows inline.
  - A "Send request" button.
  - The response view: status, time, a collapsible headers section, and the body. The body is shown in the JSON viewer when it parses, and as text otherwise.
  - Clicking a string leaf copies it, with a "Copied" flash.
  - In a static build (`import.meta.env.DEV` false and no proxy), it falls back to a direct `fetch`. A `TypeError` there is shown as "The API blocked the browser request (CORS). Run the tester with pnpm dev or pnpm preview to use the proxy."

### Task 9: App shell, RTVI wiring, connection/controls/composer

**Files:**
- Create: `src/app/App.tsx`, `src/app/Layout.tsx`, `src/app/TopBar.tsx`.
- Create: `src/rtvi/useEventRecorder.ts`, `src/rtvi/useSessionControls.ts`, `src/diagnostics/useDiagnostics.ts`.
- Create: `src/features/connection/ConnectionPanel.tsx`, `src/features/controls/ControlsPanel.tsx`, `src/features/composer/ComposerPanel.tsx`.

**Interfaces:**
- Consumes: the store (Task 7), `installPcInterceptor` (Task 4), `startSampler` (Task 5), `turnReducer` inputs (Task 6), and the wrapper's `RTVIProvider`, `useRTVI`, `RTVIAudio`, `RTVIEvent`, `RTVIMessageType`.
- Produces:
  - `src/diagnostics/useDiagnostics.ts` exports `diagnosticsSink: PcSink`, wired to the store, and `livePcs: Map<string, RTCPeerConnection>`. `main.tsx` line 1 is `import './diagnostics/install'`. That module calls `installPcInterceptor(diagnosticsSink)` and `startSampler(() => livePcs, store.addStats)`.
  - `useEventRecorder()` subscribes with `rtvi.on` to every value of `Object.values(RTVIEvent)`:
    - `localAudioLevel`/`remoteAudioLevel` → `setLevel`, and not logged.
    - `userTranscript` with `final:false` → `setInterim`, and also logged.
    - The turn-relevant events → `applyTurn`.
    - Everything is passed through `toInspectable`.
  - `useSessionControls()` returns `{ chatMode, setChatMode, desiredNoiseFilter, setDesiredNoiseFilter, botVolume, setBotVolume }`. It reconciles the mic and the noise filter as in `rtvi-wrapper/src/App.tsx:60-101`.

- [ ] Step 1: Build the layout with nested resizable groups, following the spec's layout diagram. Store sizes with `autoSaveId`. Tab placeholders are fine at this point.
- [ ] Step 2: The connection panel:
  - URL and token inputs. The token is masked, with a reveal toggle. Both are saved in localStorage key `rtvi-tester:creds`.
  - Connect calls `rtvi.connect(url, token, {audio: chatMode==='voice'})` and Disconnect calls `rtvi.disconnect()`.
  - It shows a state pill, the elapsed time and any `rtvi.error`.
  - The Connect button is disabled while the state is `connecting`.
- [ ] Step 3: Controls panel: mic toggle, noise filter switch, chat mode, screen share, mic/speaker selects (`availableMics`, `updateMic`, …) and a bot volume slider. `<RTVIAudio muted={chatMode==='text'} volume={botVolume} />` is rendered once in App.
- [ ] Step 4: The composer has three tabs:
  - **Text:** `sendClientMessage(RTVIMessageType.SEND_TEXT, {content})` plus `applyTurn({type:'textSent'})`.
  - **RTVI message:** a type select over `RTVIMessageType`, with a JSON data textarea that is validated before sending.
  - **Raw data:** a JSON object textarea → `sendRawData`.

  Every send logs `addEvent('→ ' + name, [payload], 'out')`. Sending is disabled when `!isInRoom`.
- [ ] Step 5: Run `pnpm build` and `pnpm dev`. Manually check that Connect with a bad token shows the error, and that the interceptor logs the `pc-1` creation.

### Task 10: Events, data channel, inspector, transcript

**Files:** Create `src/features/events/EventsPanel.tsx`, `src/features/data-channel/DataChannelPanel.tsx`, `src/features/inspector/InspectorPanel.tsx`, `src/features/transcript/TranscriptPanel.tsx`, `src/components/VirtualLog.tsx`

**Interfaces:**
- Produces: `VirtualLog<T>({ items, rowKey, renderRow, onSelect, selectedKey, follow })`. It uses `@tanstack/react-virtual`. Follow-tail is on by default and pauses when the user scrolls up, with a "Jump to latest" button. Keyboard: ↑/↓ move the selection.

- [ ] Step 1: The events panel:
  - Columns: time since `sessionStart` (`+12.345s`), Δ from the previous row (ms), name, and a one-line JSON summary truncated with CSS.
  - Direction is shown by colour: outbound teal, bot-origin amber.
  - Filter chips by group (connection, speech, transcript, llm/tts, metrics, media, devices, outbound), plus a text search.
- [ ] Step 2: The data channel panel:
  - Columns: dir arrow, channel, PC role, size, kind badge (`rtvi`/`json`/`text`/`other`/`error`), and the RTVI type or summary.
  - Filters: direction, kind, and "hide lossy".
- [ ] Step 3: The inspector renders the selection with `react-json-view-lite` (theme matched to the tokens), with copy-as-JSON and a header showing the kind and time.
- [ ] Step 4: The transcript renders turns (user teal, bot amber) plus the live interim line, and auto-scrolls.
- [ ] Step 5: In `pnpm dev`, check with synthetic data. In DEV only, add a `window.__rtviTester.seed()` helper that pushes fixture events and dc messages, so the panels can be seen without a room.

### Task 11: Network, metrics, turns waterfall

**Files:** Create `src/lib/UPlotChart.tsx`, `src/features/network/NetworkPanel.tsx`, `src/features/metrics/MetricsPanel.tsx`, `src/features/turns/TurnsWaterfall.tsx`

- [ ] Step 1: `UPlotChart({ series: {label, color, values}[], times, height, yLabel })` creates the plot once and calls `setData` on updates. It resizes with a ResizeObserver and reads the colours from CSS variables, so it re-renders on theme change.
- [ ] Step 2: The network panel:
  - One small chart each for RTT, jitter, loss % and kbps in/out, plus the levels (local teal, remote amber).
  - A PC selector, defaulting to the subscriber.
  - A selected-pair card with local/remote candidate types, protocol, relay yes/no and codec.
- [ ] Step 3: The metrics panel has a table of processor × (last, avg, p95) TTFB and processing, plus a sparkline per processor.
- [ ] Step 4: The turns waterfall:
  - One row per turn.
  - A shared time axis per row, starting at turn start: user span teal, bot span amber, and a gap label showing the latency in ms. The label is coloured ok under 1000 ms, warn under 2000 ms, and bad at 2000 ms or more.
  - Metric ticks along the row, with a tooltip.
  - A header with the count, p50, p95 and last.
  - Clicking a row selects the turn in the inspector.
  - It's built as plain divs with percentage widths and no chart library.

### Task 12: Peer connections, devices, top bar, README

**Files:** Create `src/features/peer-connections/PeerConnectionsPanel.tsx`, `src/features/devices/DevicesPanel.tsx`. Modify `src/app/TopBar.tsx`. Create `README.md`.

- [ ] Step 1: The peer connections panel:
  - A PC list with role, created time and current states.
  - Per PC, two sub-tabs. **Log** is a VirtualLog of `PcLogEntry`; SDP values are shown in a monospace pre in the inspector. **Stats** is `lastReport` grouped by `type`, with collapsible sections and value tables.
- [ ] Step 2: The devices panel shows mics, speakers (selected one marked), and `tracks.local`/`tracks.bot` through `toInspectable`, refreshed every second.
- [ ] Step 3: The top bar:
  - State dot and label, plus live RTT, jitter and loss chips from the latest subscriber sample, coloured by threshold.
  - An Export dropdown: "Diagnostics bundle (.json)" and "webrtc-internals dump (.json)".
  - "Copy chrome://webrtc-internals", with a tooltip: "Chrome blocks pages from opening this. Paste it in a new tab."
  - Clear session (with confirm) and the theme toggle.
- [ ] Step 4: The README covers:
  - Setup (`set -a; . ./.env; set +a; pnpm i`), `pnpm dev`, and how the proxy works.
  - Why the interceptor must load first.
  - The panel map.
  - How to view an exported dump in the rtcstats dump-importer (`https://rtcstats.github.io/rtcstats/dump-importer/`).

### Task 13: Verification
- [ ] `pnpm test` passes with all suites green. `pnpm lint` gives 0 errors. `pnpm build` exits 0.
- [ ] Screenshots of `pnpm dev` with the seeded data, in dark and light themes. Self-critique against the spec's visual direction and fix what reads as generic.
- [ ] A live E2E check against a real room (URL+token or curl from the user):
  - events flow
  - the data channel shows both directions
  - RTT matches `chrome://webrtc-internals` within ±10 ms
  - turns show latency
  - the exported dump loads in the dump-importer
