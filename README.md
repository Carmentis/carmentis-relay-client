<p align="center">
  <img src="./assets/carmentis.svg" alt="Carmentis" width="220" />
</p>

<h1 align="center">Carmentis Relay Client</h1>

<p align="center">
  A TypeScript client for the Carmentis Relay service with end-to-end AEAD encryption.
</p>

---

## Why?

The Carmentis Relay lets two peers exchange messages through a relay server **without
trusting that server with their data**. One peer (the **Initiator**) creates a session
and generates a symmetric key; the other peer (the **Responder**) joins using the same
session id and key. Every message is encrypted with **AES-256-GCM** before it leaves the
client, so the relay only ever sees ciphertext.

- 🔒 **End-to-end encrypted** — AES-256-GCM (AEAD) authenticated encryption. The relay never sees plaintext.
- 🔁 **Real-time** — bidirectional messaging over Socket.IO (WebSocket).
- 🌐 **Universal** — runs in Node.js (via the built-in `crypto` module) and in the browser (via the Web Crypto API), with no code changes.
- 📦 **Drop-in browser build** — a single self-contained `<script>` file with all dependencies bundled.
- 🧩 **Typed** — generic message types so `send`/`onMessage` are type-safe.

## How it works

```
  Initiator                         Relay server                       Responder
     │                                   │                                  │
     │  POST /session/create             │                                  │
     ├──────────────────────────────────▶                                  │
     │  { sessionId }                    │                                  │
     ◀──────────────────────────────────┤                                  │
     │  generate AEAD key (local)        │                                  │
     │                                   │   share sessionId + key          │
     │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▶│ (out of band)
     │  init (socket)                    │   join (socket)                  │
     ├──────────────────────────────────▶◀─────────────────────────────────┤
     │      encrypted message  ───────▶  relay  ───────▶  encrypted message │
     ◀──────────────────────────────────────────────────────────────────────▶
```

The session id is created by the relay; the AEAD key is generated **locally** by the
Initiator and shared with the Responder over a channel of your choosing (QR code, link,
etc.). The key never touches the relay.

## Installation

```bash
npm install @cmts-dev/carmentis-relay-client
# or
pnpm add @cmts-dev/carmentis-relay-client
# or
yarn add @cmts-dev/carmentis-relay-client
```

## Usage

### Node.js / bundlers (ESM & CommonJS)

```ts
import { Initiator, Responder } from "@cmts-dev/carmentis-relay-client";

const relayUrl = "https://relay.example.com";

// ── Initiator: create a session and obtain the key ──────────────────────────
const initiator = await Initiator.createSession(relayUrl);

console.log("Session id:", initiator.getSessionId());
console.log("AEAD key:  ", initiator.getKey()); // share these with the responder

initiator
  .onMessage((msg) => console.log("[initiator] received:", msg))
  .onError((err) => console.error("[initiator] error:", err))
  .onClose(() => console.log("[initiator] closed"));

await initiator.init();
await initiator.send("Hello from the initiator!");

// ── Responder: join the same session with the shared id + key ───────────────
const responder = Responder.create(
  relayUrl,
  initiator.getSessionId(),
  initiator.getKey(),
);

responder
  .onMessage((msg) => console.log("[responder] received:", msg))
  .onError((err) => console.error("[responder] error:", err));

await responder.join();
await responder.send("Hello back from the responder!");
```

### Browser (single-file build)

A pre-bundled, self-contained build is published with the package and exposes everything
under the global `CarmentisRelay`. No bundler or module loader required.

```html
<script src="https://unpkg.com/@cmts-dev/carmentis-relay-client/dist/carmentis-relay-client.browser.js"></script>
<script>
  (async () => {
    const relayUrl = "https://relay.example.com";

    const initiator = await CarmentisRelay.Initiator.createSession(relayUrl);
    console.log("Share these:", initiator.getSessionId(), initiator.getKey());

    initiator.onMessage((msg) => console.log("received:", msg));
    await initiator.init();
    await initiator.send({ hello: "world" });
  })();
</script>
```

> You can also self-host the file by copying
> `node_modules/@cmts-dev/carmentis-relay-client/dist/carmentis-relay-client.browser.js`
> into your project.

### Typed messages

Both clients are generic, so you can pin the message shape:

```ts
interface ChatMessage {
  from: string;
  text: string;
}

const initiator = await Initiator.createSession<ChatMessage>(relayUrl);

initiator.onMessage((msg) => {
  // msg is typed as ChatMessage
  console.log(`${msg.from}: ${msg.text}`);
});

await initiator.send({ from: "alice", text: "hi" }); // type-checked
```

## API

### `Initiator`

| Member | Description |
| --- | --- |
| `static createSession<T>(relayUrl)` | Creates a new relay session and generates a fresh AEAD key. Returns an `Initiator`. |
| `init()` | Connects to the relay over the socket and waits until the session is initialized. |
| `getSessionId()` | The session id to share with the responder. |
| `getKey()` | The hex-encoded AEAD key to share with the responder. |

### `Responder`

| Member | Description |
| --- | --- |
| `static create<T>(relayUrl, sessionId, aeadKey)` | Builds a `Responder` for an existing session. |
| `join()` | Connects to the relay and joins the session. |

### Shared (`RelayClient`)

Both `Initiator` and `Responder` extend `RelayClient` and expose:

| Member | Description |
| --- | --- |
| `send(message)` | Encrypts and sends a message. Rejects if the socket is not connected. |
| `close()` | Disconnects from the relay. |
| `isConnected()` | Whether the socket is currently connected. |
| `getSessionId()` | The current session id. |
| `onMessage(handler)` | Called with each decrypted incoming message. |
| `onError(handler)` | Called on socket or decryption errors. |
| `onClose(handler)` | Called when the connection closes. |
| `onPeerDisconnected(handler)` | Called when the other peer disconnects. |
| `onSessionReady(handler)` | Called when both peers are connected. |

All `on*` handlers return `this`, so they can be chained.

## Building from source

```bash
pnpm install
pnpm run build         # tsc (CommonJS + .d.ts) + single-file browser bundle
pnpm run build:browser # only the browser bundle
pnpm test              # run the test suite
```

Build outputs land in `dist/`:

- `dist/index.js` + `dist/index.d.ts` — CommonJS entry point with type declarations.
- `dist/carmentis-relay-client.browser.js` — minified, self-contained IIFE bundle for the browser.

## License

MIT
