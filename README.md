# RTVI Tester

A diagnostics console for voice bots on LiveKit. It runs the published
[`@rezolve-pred/rzlv-rtvi-wrapper`](https://www.npmjs.com/package/@rezolve-pred/rzlv-rtvi-wrapper)
exactly as an app would. Alongside that it records everything on the wire:

- every RTVI event
- raw data-channel packets in both directions
- Pipecat metrics
- per-turn response latency
- webrtc-internals-style peer connection stats

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

`pnpm build && pnpm preview` also works. The cURL proxy is available in both `dev` and `preview`.

You need **Chrome or another Chromium browser**. Stats such as audio level and jitter come from Chrome's
`getStats()` fields.

## Using it

1. **Get credentials.** Paste a LiveKit URL and token into *Connection*. Or open *Get a token with cURL*,
   paste the curl command your backend uses, and press *Send request*. Every string in the response gets a
   *Copy* button, so you can copy the URL and token straight into the form.
2. **Connect.** *Voice* mode turns on the mic and plays bot audio. *Text only* keeps the mic off and the bot
   muted, and you talk through *Send to bot*.
3. **Watch.**

| Panel | What it shows |
|---|---|
| Response latency per turn | One row per turn, all aligned on the moment you finished speaking. The gap before the amber bar is the bot's response latency. Shows p50/p95 and per-service TTFB. |
| Events | Every wrapper event (`RTVIEvent.*`) plus what the tester sent. Filters by group, text search, and Δms between rows. |
| Data channel | Every LiveKit data packet in both directions, protobuf-decoded. Includes packets the wrapper ignores (non-RTVI JSON, text, other packet kinds, undecodable bytes). |
| Pipecat metrics | Last, average and p95 TTFB and processing time per Pipecat service. |
| Network | RTT, jitter, packet loss, bitrate and audio level per peer connection, plus the selected ICE candidate pair and codec. |
| Peer connections | Per connection: an SDP/ICE/state log like webrtc-internals, plus the raw `getStats()` report. |
| Transcript | The conversation, with live interim text. |
| Devices & tracks | Mics, speakers, and the local and bot media tracks. |
| Inspector | The full JSON of whatever you select. SDP is shown as text. |

**Export** in the top bar downloads two files. Both mask tokens and TURN credentials (only the last 6
characters are kept).

- **Diagnostics bundle:** everything above as one JSON file. Attach it to tickets.
- **webrtc-internals dump:** the same format Chrome's *Create dump* produces. Open it in the
  [rtcstats dump importer](https://rtcstats.github.io/rtcstats/dump-importer/).

Chrome doesn't let web pages open `chrome://webrtc-internals`. The *webrtc-internals* button copies the
address so you can paste it into a new tab and compare side by side.

## How it sees the wire

The wrapper doesn't expose the LiveKit `Room`. So `src/diagnostics/install.ts` replaces
`window.RTCPeerConnection` with a subclass **before anything else loads**. It must stay the first import
in `src/main.tsx`.

The subclass:

- logs SDP, ICE and state changes
- taps data-channel `send` and `message`
- registers the connection with a 1 Hz `getStats()` sampler

`instanceof` checks and static methods keep working.

## Code map

```
src/
  main.tsx                 installs the interceptor first, then renders
  app/                     App (provider + tabs), Layout (resizable panes), TopBar
  diagnostics/             pcInterceptor, livekitPacket decode, stats sampler, export
  rtvi/                    event recorder, turn reducer, mic/noise-filter reconciliation
  store/                   session store (recorded data), prefs store (persisted settings)
  curl/                    curl command parser
  features/<panel>/        one folder per panel
  components/              shared UI (VirtualLog, JsonTree, UPlotChart, …) + shadcn ui/
  dev/seed.ts              DEV only: open /?seed to fill every panel with sample data
vite/curlProxy.ts          POST /__proxy for the cURL runner (loopback clients only)
vite/daily-stub.ts         see "Known wrapper issue"
```

`pnpm test` runs unit tests for the parser, decoder, interceptor, stats, turns and export logic.
`pnpm lint` runs ESLint.

## Known wrapper issue

The wrapper lazy-loads `@daily-co/daily-js` with a literal `import()`. Vite resolves that even with
`/* @vite-ignore */`, so a LiveKit-only app fails to start unless Daily is installed. The tester aliases
the module to an empty stub in `vite.config.ts`. It would be better fixed in the wrapper, for example
with a non-literal specifier.
