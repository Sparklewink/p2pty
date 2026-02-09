# P2PTY
**P2PTY** is a lightweight, high-security WebRTC-based peer-to-peer file transfer protocol library.  
Designed specifically for browser environments, it achieves **end-to-end encryption (E2EE)** through **ECDH key exchange** and **AES-GCM encryption**, with built-in chunk hash verification, automatic retransmission, and resume-from-breakpoint logic to ensure secure and reliable file transfers.

[![中文](https://img.shields.io/badge/中文-red?style=flat-square)](README.md)  
[![English](https://img.shields.io/badge/English-blue?style=flat-square)](docs/README_EN.md)

## Table of Contents
- [P2PTY](#p2pty)
- [Core Features](#-core-features)
- [Installation](#-installation)
- [Network Configuration Guide (STUN/TURN)](#-network-configuration-guide-stunturn)
  - [Recommended STUN Servers](#recommended-stun-servers)
  - [Configuration Example](#configuration-example)
- [Quick Start](#-quick-start)
  - [1. Host Side (Host / Sender)](#1-host-side-host--sender)
  - [2. Peer Side (Peer / Receiver)](#2-peer-side-peer--receiver)
- [API Documentation](#-api-documentation)
  - [Config Object](#config-object)
  - [Methods](#methods)
  - [Events](#events)
- [Security Design](#️-security-design)
- [Principles and Architecture](#-Principles-and-Architecture)
- [FAQ & Troubleshooting](#-faq--troubleshooting)
  - [1. Error Code Reference](#1-error-code-reference)
  - [2. Common Connection Issues](#2-common-connection-issues)
- [Notes](#️-notes)
- [Demo](#demo)
- [Cloudflare Pages Deployment](#-cloudflare-pages-deployment)
  - [Deployment Configuration Guide](#️-deployment-configuration-guide)
  - [Configuring Cloudflare API Token (Fix wrangler Authentication Error)](#️-configuring-cloudflare-api-token-fix-wrangler-authentication-error)
  - [Manual Deployment](#️-manual-deployment)
- [License](#-license)

## ✨ Core Features
* 🔒 **End-to-End Encryption**: Uses ECDH (P-384) for key negotiation and AES-256-GCM to encrypt the data channel, preventing man-in-the-middle eavesdropping.
* 📦 **Reliable Transfer**: Built-in 16MB chunking mechanism with real-time SHA-256 integrity verification.
* 🔄 **Automatic Error Correction**: Supports per-chunk hash validation; corrupted chunks are automatically retransmitted without resending the entire file.
* 🌍 **Smart Connectivity**: Enforces multiple STUN/TURN configurations, leveraging WebRTC for automatic NAT traversal and failover.
* 📝 **Identity Verification**: ECDSA-based digital signatures on connection links to ensure the trustworthiness of the connecting party.

## 📦 Installation
P2PTY is currently provided as an ES Module. Ensure your environment supports ES6+ and the Web Crypto API.

```javascript
import { P2PTY } from './p2pty.js';
// Dependencies: Ensure @noble/hashes is accessible in your environment (already imported via esm.sh in the code)
```

## 🌐 Network Configuration Guide (STUN/TURN)
To ensure successful P2P connections across various network environments, you **must** configure valid ICE servers.

### Recommended STUN Servers
The following servers offer fast and stable access. It is recommended to combine them when configuring `iceServers`:

| Provider       | URL                              | Stability     | Notes                          |
|----------------|----------------------------------|---------------|--------------------------------|
| **Tencent**    | `stun:stun.qq.com:3478`         | ⭐⭐⭐⭐⭐       | Extremely high connectivity in China |
| **Xiaomi**     | `stun:stun.miwifi.com:3478`     | ⭐⭐⭐⭐⭐       | Fast response time             |
| **Cloudflare** | `stun:stun.cloudflare.com:3478` | ⭐⭐           | Recommended as fallback        |

### Configuration Example
When initializing `P2PTY`, it is recommended to pass multiple STUN addresses at once. The WebRTC engine will automatically select the fastest one:

```javascript
const iceConfig = [
    { urls: "stun:stun.qq.com:3478" },
    { urls: "stun:stun.miwifi.com:3478" },
    { urls: "stun:stun.cloudflare.com:3478" }
];
```

> **Note**: In complex symmetric NAT environments (e.g., 4G/5G mobile networks or corporate intranets), STUN alone may fail to traverse. It is strongly recommended to deploy and configure a **TURN** server (e.g., coTURN) in production.

---

## ⚡ Quick Start
P2PTY requires you to implement a simple signaling channel (e.g., WebSocket) to exchange WebRTC SDP and Candidate information.

### 1. Host Side (Host / Sender)
The host generates the connection link and sends the file.

```javascript
import { P2PTY, CryptoUtils } from './p2pty.js';
async function startHost() {
    // 1. Generate host identity key pair (ECDSA)
    const identity = await CryptoUtils.generateIdentityKeyPair();
    // 2. Initialize instance (configure STUN servers)
    const p2p = new P2PTY({
        role: 'HOST',
        identity: identity,
        iceServers: [
            { urls: "stun:stun.qq.com:3478" }, // Tencent
            { urls: "stun:stun.miwifi.com:3478" } // Xiaomi
        ]
    });
    // 3. Handle signaling (send to Peer)
    p2p.on('onSignal', (data) => {
        console.log('Generated signaling data, send to Peer:', JSON.stringify(data));
        // WebSocket.send(data)...
    });
    // 4. Listen for connection success
    p2p.on('onConnect', async () => {
        console.log('P2P connection established! Security fingerprint:', p2p.getFingerprint());
       
        // Send file
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files[0]) {
            await p2p.sendFile(fileInput.files[0]);
        }
    });
    // 5. Generate invitation link (with public key signature)
    const link = await p2p.generateLink("Optional relay info", 300); // Expires in 300 seconds
    console.log('Invitation link:', link);
    // Start
    await p2p.start();
}
```

### 2. Peer Side (Peer / Receiver)
The peer joins via the connection string and receives the file.

```javascript
import { P2PTY } from './p2pty.js';
async function startPeer(connectionString) {
    // 1. Initialize instance
    const p2p = new P2PTY({
        role: 'PEER',
        connectionString: connectionString, // String obtained from Host
        iceServers: [
            { urls: "stun:stun.qq.com:3478" }, // Tencent
            { urls: "stun:stun.miwifi.com:3478" } // Xiaomi
        ]
    });
    // 2. Handle signaling (send back to Host)
    p2p.on('onSignal', (data) => {
        // WebSocket.send(data)...
    });
    // 3. Listen for file progress
    p2p.on('onFileProgress', (loaded, total) => {
        console.log(`Transfer progress: ${((loaded / total) * 100).toFixed(2)}%`);
    });
    // 4. Listen for file reception completion
    p2p.on('onFileVerified', (isSuccess) => {
        if (isSuccess) console.log('File received and verified successfully!');
    });
   
    // 5. Get file chunks (optional, for streaming processing)
    const receivedChunks = [];
    p2p.on('onFileChunk', (arrayBuffer) => {
        receivedChunks.push(arrayBuffer);
    });
    await p2p.start();
}
```

---

## 📖 API Documentation

### Config Object
Pass the following when creating `new P2PTY(config)`:

| Property            | Type              | Required | Description                                                                 |
|---------------------|-------------------|----------|-----------------------------------------------------------------------------|
| `role`              | `'HOST' \| 'PEER'`| ✅       | Current instance role.                                                      |
| `iceServers`        | `RTCIceServer[]`  | ✅       | **Must provide**. List of STUN/TURN servers.                                |
| `identity`          | `CryptoKeyPair`   | ❌       | **Required for HOST**. Generated via `CryptoUtils.generateIdentityKeyPair()`. |
| `connectionString`  | `String`          | ❌       | **Required for PEER**. Signed connection string generated by HOST.         |

### Methods

#### `start()`
Starts the P2P process: collects ICE candidates and generates Offer (Host) or prepares to receive (Peer).

#### `generateLink(relayPayload, expireSeconds)`
* **Host only**.  
* `relayPayload`: Arbitrary string (e.g., signaling room ID).  
* `expireSeconds`: Link expiration (default: 300 seconds).  
* **Returns**: Signed connection string.

#### `sendFile(fileBlob)`
* **Host only**.  
* `fileBlob`: JS `File` or `Blob` object.  
Starts chunking, encrypting, and sending the file.

#### `close()`
Closes the data channel and PeerConnection, cleans up resources.

#### `getFingerprint()`
Returns the connection's security fingerprint (SHA-256). Peers can compare fingerprints to verify no MITM attack.

### Events
Listen using `p2p.on('eventName', callback)`.

| Event Name          | Callback Params          | Description                                                                 |
|---------------------|--------------------------|-----------------------------------------------------------------------------|
| `onSignal`          | `(data)`                 | **Core event**. Triggered when WebRTC generates SDP or ICE Candidate. Forward via signaling server. |
| `onConnect`         | `()`                     | Triggered when P2P connection is established, key exchange completed, and handshake succeeds. |
| `onFingerprint`     | `(hexString)`            | Generated security fingerprint during key confirmation phase.               |
| `onFileProgress`    | `(loaded, total)`        | File transfer progress update (in bytes).                                   |
| `onFileChunk`       | `(ArrayBuffer)`          | Received a verified complete chunk (default 16MB).                          |
| `onFileVerified`    | `(bool)`                 | Entire file transfer complete and full SHA-256 hash verified.               |
| `onError`           | `(Error)`                | Severe error occurred (e.g., handshake timeout, key error, disconnection).  |
| `onReconnectNeeded` | `(lastChunkId)`          | Connection unexpectedly lost; upper layer should attempt reconnection.      |

---

## 🛡️ Security Design
1. **Identity Binding**: `connectionString` includes the Host's ECDSA public key and a digital signature over link parameters. Peer enforces signature verification on parse to prevent tampering.
2. **Forward Secrecy (PFS)**: Each session uses ephemeral ECDH key pairs to negotiate a shared session key. Even if long-term identity keys are compromised, past session traffic remains undecryptable.
3. **Replay Attack Resistance**: Handshake includes random `Nonce`; encrypted packets contain incrementing sequence numbers (`seq`) to prevent replays.
4. **Data Integrity**:
   - **Per-chunk**: Each 16MB chunk computes independent SHA-256; receiver verifies in real time.
   - **File-level**: Final full-file SHA-256 hash comparison ensures 100% accuracy.
  
## 📝Principles and Architecture

P2PTY achieves secure and reliable P2P file transfer between browsers through **WebRTC data channel** + **strong authentication and key negotiation** + **application-layer fragmentation verification**.

### Overall Architecture

![P2PTY Overall Architecture](../img/jg1.png)

### Connection Handshake Process

![Handshake Process](../img/jg2.png)

### File Transfer and Integrity Verification Process

![File Transfer Process](../img/jg3.png)

### Core Security Design

![Key Security Design Points](../img/jg4.png)

## ❓ FAQ & Troubleshooting
Refer to the following error codes and solutions if issues arise during development or testing.

### 1. Error Code Reference
P2PTY throws `ProtocolError` via `onError` event with the following `code`:

| Error Code            | Meaning                  | Possible Cause                                      | Recommended Solution                                                                 |
|-----------------------|--------------------------|-----------------------------------------------------|--------------------------------------------------------------------------------------|
| `TIMEOUT_HANDSHAKE`   | Handshake timeout        | Peers didn't complete connection within 60s         | 1. Check signaling server forwards messages correctly.<br>2. Verify STUN availability.<br>3. Check for UDP firewall blocks. |
| `LINK_INVALID`        | Invalid link             | Failed to parse connection string                   | 1. Ensure link copied completely.<br>2. Check expiration (default 300s).<br>3. Host signature verification failed. |
| `MAX_RETRIES`         | Too many verification failures | Same chunk retransmitted >5 times                  | Poor network or malicious injection. Check network stability.                        |
| `PC_CONN_LOST`        | Connection lost          | Underlying WebRTC connection dropped                | Network fluctuation or one side offline. Use `onReconnectNeeded` for retry logic.    |
| `FILE_HASH_MISMATCH`  | File verification failed | Final SHA-256 doesn't match                         | Extremely rare (hash collision or logic error). Retransmit file.                     |
| `MITM_ALERT`          | MITM warning             | Public key or fingerprint mismatch                  | Possible man-in-the-middle. Stop transfer and verify signaling channel security.     |

### 2. Common Connection Issues

#### Q: Why does it stay stuck in `SIGNALING` state and fail to connect?
**A:** Usually caused by **ICE traversal failure**.  
- **Check STUN config**: Ensure `iceServers` includes China-accessible STUN (e.g., Tencent, Xiaomi).  
- **Symmetric NAT**: 4G/5G or enterprise networks often use symmetric NAT → STUN alone fails. **Must** configure TURN relay server.

#### Q: Getting error `must provide 'iceServers'`?
**A:** P2PTY does not include default STUN servers. You **must** explicitly pass an `iceServers` array on initialization.

#### Q: High memory usage when transferring large files?
**A:** Default chunk size is 16MB; receiver buffers chunks in memory for verification. For memory-constrained devices, reduce `CHUNK_SIZE` in source code (e.g., to 4MB), though this increases hash computation frequency slightly.

#### Q: How to verify the connection is securely encrypted?
**A:** Call `p2p.getFingerprint()` in the `onConnect` callback. Have users verbally compare or verify the first few characters of each other's fingerprint via another channel. This is WebRTC's best-practice security check.

## ⚠️ Notes
1. **Signaling Server**: This library does **not** include a signaling server. You must set up a simple WebSocket service to exchange `onSignal` data between Host and Peer.
2. **ICE Servers**: To guarantee connectivity in complex networks (4G/5G, symmetric NAT), **always** include usable TURN servers in `iceServers`.

## ⚡ Demo
A Vue.js-based demo site is available for testing:  
https://p2pty.lty.qzz.io

![Main Interface](../img/z.PNG)  
![Sending Interface 1](../img/f1.PNG)  
![Sending Interface 2](../img/f2.PNG)

You can also deploy this demo on Cloudflare.

## ☁️ Cloudflare Pages Deployment
This project supports one-click deployment to Cloudflare Pages. Click the button below to start:

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://deploy.workers.cloudflare.com/?url=https://github.com/Sparklewink/p2pty)

### ⚙️ Deployment Configuration Guide
After clicking, you'll see the setup page. Due to the project's special structure, modify the default settings as follows (otherwise build will fail):

| Field              | Value                                              | Explanation                                      |
|--------------------|----------------------------------------------------|--------------------------------------------------|
| **Build Command**  | `cd transfer && npm install && npm run build`      | Must enter subdirectory before building          |
| **Deploy Command** | `npx wrangler pages deploy transfer/dist`          | Explicitly publish the `dist` static directory   |
| **Path**           | `/`                                                | Keep default                                     |

### ⚙️ Configuring Cloudflare API Token (Fix wrangler Authentication Error)
If automatic build + wrangler deployment fails with:

```
Authentication error [code: 10000]
Please ensure it has the correct permissions for this operation.
```

This means wrangler lacks sufficient API permissions. Follow these steps to create and configure a dedicated API Token:

1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com  
   Click top-right avatar → **My Profile** → **API Tokens** (or visit: https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Choose **Create Custom Token** (or modify a template):
   - Token name: Suggest `p2pty-pages-deploy-token` (for easy identification)
   - **Permissions** — Add at least the following (recommend all for safety):
     - **Account** → **Cloudflare Pages** → **Edit** (**required**, or you'll get 10000 error)
     - **Account** → **Workers Scripts** → **Edit** (recommended, common for wrangler)
     - **User** → **User Details** → **Read** (optional but safer)
   - **Account Resources**: Choose **All accounts** or select your specific account (ID: 2982c212c4ac2c12419559409eed8b24)
   - **Zone Resources**: **None** (Pages projects don't need Zone permissions)
4. Click **Continue to summary** → **Create Token**  
   → Immediately copy the **Token value** (shown only once; recreate if lost)
5. Return to your Cloudflare Pages project (https://dash.cloudflare.com → Pages → your p2pty-transfer project):
   - Click **Settings** → **Environment variables**
   - Add variable:
     - **Variable name**: `CLOUDFLARE_API_TOKEN` (must be uppercase)
     - **Value**: Paste the copied Token
     - **Type**: **Encrypted** (recommended)
   - Save
6. Trigger redeploy:
   - Go to **Deployments** → Find the latest failed build → Click **Retry deployment**  
     Or push an empty commit (`git commit --allow-empty -m "trigger redeploy"`) to retrigger

After this, wrangler can successfully call the Cloudflare API to run `npx wrangler pages deploy transfer/dist`.

### ☁️ Manual Deployment
1. Fork this repository (or clone it).
2. Log in to Cloudflare Dashboard: https://dash.cloudflare.com
3. Go to **Compute & AI** → **Workers & Pages**
4. Create deployment → Create Pages project
5. Import an existing Git repository
6. Select this project
7. **Build Command**: `cd transfer && npm install && npm run build`

## 📄 License
Apache-2.0
