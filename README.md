# P2PTY
**P2PTY** 是一个轻量级、高安全性的 WebRTC 点对点文件传输协议库。

它专为浏览器环境设计，通过 **ECDH 密钥交换** 和 **AES-GCM 加密** 实现了端到端加密（E2EE），并内置了分片哈希校验、自动重传和断点续传逻辑，确保文件传输的安全与可靠。

## ✨ 核心特性

* 🔒 **端到端加密**：使用 ECDH (P-384) 协商密钥，AES-256-GCM 加密数据通道，拒绝中间人监听。
* 📦 **可靠传输**：内置 16MB 分片机制，支持 SHA-256 实时完整性校验。
* 🔄 **自动纠错**：支持分片级哈希验证，数据损坏自动重传，无需重发整个文件。
* 🌍 **智能连接**：强制多 STUN/TURN 配置，利用 WebRTC 自动进行网络穿透和故障切换。
* 📝 **身份验证**：基于 ECDSA 的数字签名链接，确保连接方的身份可信。

## 📦 安装

目前 P2PTY 以 ES Module 形式提供。请确保你的环境支持 ES6+ 及 Web Crypto API。

```javascript
import { P2PTY } from './p2pty.js';
// 依赖项：需要确保环境中能访问 @noble/hashes (代码中已通过 esm.sh 引入)

```

## 🌐 网络配置指南 (STUN/TURN)

为了确保在不同网络环境下能成功建立 P2P 连接，**必须**配置有效的 ICE 服务器。

### 推荐 STUN 服务器列表

以下服务器访问速度快且稳定，建议在配置 `iceServers` 时组合使用：

| 提供商 | 地址 (URL) | 稳定性 | 备注 |
| --- | --- | --- | --- |
| **腾讯 (Tencent)** | `stun:stun.qq.com:3478` | ⭐⭐⭐⭐⭐ | 国内连通率极高 |
| **小米 (Xiaomi)** | `stun:stun.miwifi.com:3478` | ⭐⭐⭐⭐⭐ | 响应速度快 |
| **CloudFlare** | `stun:stun.cloudflare.com:3478` | ⭐⭐ | 建议作为备选 |

### 配置示例

在初始化 `P2PTY` 时，建议同时传入多个 STUN 地址，WebRTC 引擎会自动选择最快的一个：

```javascript
const iceConfig = [
    { urls: "stun:stun.qq.com:3478" },
    { urls: "stun:stun.miwifi.com:3478" },
    { urls: "stun:stun.cloudflare.com:3478" }
];

```

> **注意**：如果处于复杂的对称型 NAT 网络（如 4G/5G 或企业内网），仅使用 STUN 可能无法穿透。建议在生产环境中额外部署并配置 **TURN** 服务器（如 coTURN）。

---

## ⚡ 快速上手

P2PTY 需要你自己实现一个简单的信令通道（如 WebSocket）来交换 WebRTC 的 SDP 和 Candidate 信息。

### 1. 主机端 (Host / Sender)

主机负责生成连接链接并发送文件。

```javascript
import { P2PTY, CryptoUtils } from './p2pty.js';

async function startHost() {
    // 1. 生成主机身份密钥 (ECDSA)
    const identity = await CryptoUtils.generateIdentityKeyPair();

    // 2. 初始化实例 (配置STUN 服务器)
    const p2p = new P2PTY({
        role: 'HOST',
        identity: identity,
        iceServers: [
            { urls: "stun:stun.qq.com:3478" },      // 腾讯
            { urls: "stun:stun.miwifi.com:3478" }   // 小米
        ]
    });

    // 3. 处理信令 (需要将其发送给 Peer)
    p2p.on('onSignal', (data) => {
        console.log('生成的信令数据，请发送给 Peer:', JSON.stringify(data));
        // WebSocket.send(data)...
    });

    // 4. 监听连接成功
    p2p.on('onConnect', async () => {
        console.log('P2P 连接已建立！安全指纹:', p2p.getFingerprint());
        
        // 发送文件
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files[0]) {
            await p2p.sendFile(fileInput.files[0]);
        }
    });

    // 5. 生成邀请链接 (包含公钥签名)
    const link = await p2p.generateLink("可选的Relay信息", 300); // 300秒过期
    console.log('邀请链接:', link);

    // 启动
    await p2p.start();
}

```

### 2. 客户端 (Peer / Receiver)

客户端通过连接字符串加入，并接收文件。

```javascript
import { P2PTY } from './p2pty.js';

async function startPeer(connectionString) {
    // 1. 初始化实例
    const p2p = new P2PTY({
        role: 'PEER',
        connectionString: connectionString, // 从 Host 获取的字符串
        iceServers: [
            { urls: "stun:stun.qq.com:3478" },      // 腾讯
            { urls: "stun:stun.miwifi.com:3478" }   // 小米
        ]
    });

    // 2. 处理信令 (需要发送回 Host)
    p2p.on('onSignal', (data) => {
        // WebSocket.send(data)...
    });

    // 3. 监听文件进度
    p2p.on('onFileProgress', (loaded, total) => {
        console.log(`传输进度: ${((loaded / total) * 100).toFixed(2)}%`);
    });

    // 4. 监听文件接收完成
    p2p.on('onFileVerified', (isSuccess) => {
        if (isSuccess) console.log('文件接收并校验成功！');
    });
    
    // 5. 获取文件块 (可选，用于流式处理)
    const receivedChunks = [];
    p2p.on('onFileChunk', (arrayBuffer) => {
        receivedChunks.push(arrayBuffer);
    });

    await p2p.start();
}

```

---

## 📖 API 文档

### 配置对象 (Config)

在 `new P2PTY(config)` 中传入：

| 属性名 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `role` | `'HOST' 'PEER'` | ✅ | 当前实例的角色。 |
| `iceServers` | `RTCIceServer[]` | ✅ | **必须传入**。STUN/TURN 服务器列表。|
| `identity` | `CryptoKeyPair` | ❌ | **HOST 必填**。使用 `CryptoUtils.generateIdentityKeyPair()` 生成。 |
| `connectionString` | `String` | ❌ | **PEER 必填**。由 HOST 生成的包含签名和公钥的字符串。 |

### 方法 (Methods)

#### `start()`

启动 P2P 流程，开始搜集 ICE 候选者并生成 Offer (Host) 或准备接收 (Peer)。

#### `generateLink(relayPayload, expireSeconds)`

* **Host Only**。
* `relayPayload`: 任意字符串，可用于传递信令服务器的 Room ID 等信息。
* `expireSeconds`: 链接有效期，默认 300 秒。
* **返回**: 签名后的连接字符串。

#### `sendFile(fileBlob)`

* **Host Only**。
* `fileBlob`: JS `File` 对象或 `Blob` 对象。
* 开始分片、加密并发送文件。

#### `close()`

关闭数据通道和 PeerConnection，清理资源。

#### `getFingerprint()`

获取连接的安全指纹（SHA-256），双方可比对该指纹以确认未被中间人攻击。

### 事件 (Events)

使用 `p2p.on('eventName', callback)` 监听。

| 事件名 | 回调参数 | 描述 |
| --- | --- | --- |
| `onSignal` | `(data)` | **核心**。当 WebRTC 生成 SDP 或 ICE Candidate 时触发。需通过信令服务器转发给对方。 |
| `onConnect` | `()` | P2P 连接建立、密钥交换完成且握手成功时触发。 |
| `onFingerprint` | `(hexString)` | 密钥确认阶段生成的安全指纹。 |
| `onFileProgress` | `(loaded, total)` | 文件传输进度更新（字节）。 |
| `onFileChunk` | `(ArrayBuffer)` | 接收到一个校验通过的完整分片（默认 16MB）。 |
| `onFileVerified` | `(bool)` | 整个文件传输完成且全量 SHA-256 校验通过。 |
| `onError` | `(Error)` | 发生严重错误（如握手超时、密钥错误、断开连接）。 |
| `onReconnectNeeded` | `(lastChunkId)` | 连接意外断开，建议上层应用尝试重连。 |

---

## 🛡️ 安全性设计

1. **身份绑定**：`connectionString` 包含 Host 的 ECDSA 公钥和对链接参数的数字签名。Peer 在解析链接时会强制验证签名，防止链接被篡改。
2. **前向保密 (PFS)**：每次会话使用临时的 ECDH 密钥对协商共享密钥 (`session key`)。即使长期身份密钥泄露，也无法解密过去的历史流量。
3. **抗重放攻击**：协议握手阶段包含随机 `Nonce`，且加密数据包包含自增序列号 (`seq`)，防止重放攻击。
4. **数据完整性**：
* **分片级**：每个 16MB 分片独立计算 SHA-256，接收端实时校验。
* **文件级**：传输结束时比对全局 SHA-256 哈希，确保文件 100% 准确。



## ❓ 常见问题与故障排查

如果在开发或测试过程中遇到问题，请参考以下错误码和解决方案。

### 1. 错误码对照表

P2PTY 会通过 `onError` 事件抛出 `ProtocolError`，包含以下 `code`：

| 错误码 (Code) | 含义 | 可能原因 | 建议解决方案 |
| --- | --- | --- | --- |
| `TIMEOUT_HANDSHAKE` | 握手超时 | 双方未在 60秒内完成连接建立。 | 1. 检查信令服务器是否正常转发消息。<br><br>2. 检查 STUN 服务器是否可用。<br><br>3. 双方网络是否存在防火墙拦截 UDP。 |
| `LINK_INVALID` | 链接无效 | 解析连接字符串失败。 | 1. 链接是否完整复制？<br><br>2. 链接是否已过期（默认 300秒）？<br><br>3. Host 端公钥签名验证失败。 |
| `MAX_RETRIES` | 校验失败过多 | 同一分片重传次数超过 5 次。 | 网络环境极差或存在恶意数据包注入。建议检查网络稳定性。 |
| `PC_CONN_LOST` | 连接中断 | WebRTC 底层连接断开。 | 网络波动或一方断网。可通过 `onReconnectNeeded` 尝试重连逻辑。 |
| `FILE_HASH_MISMATCH` | 文件校验失败 | 最终文件 SHA-256 不匹配。 | 极其罕见。说明传输过程中发生了哈希碰撞或逻辑错误。需重新传输文件。 |
| `MITM_ALERT` | 中间人警告 | 公钥或指纹不匹配。 | 可能存在中间人攻击，停止传输并检查信令通道安全性。 |

### 2. 常见连接问题

#### Q: 为什么一直卡在 `SIGNALING` 状态，无法连接？

**A:** 这通常是 **ICE 穿透失败** 导致的。

* **检查 STUN 配置**：确保 `iceServers` 中配置了国内可用的 STUN 地址（如腾讯、小米）。
* **对称型 NAT**：如果一方处于 4G/5G 网络或企业内网（对称型 NAT），仅依靠 STUN 可能无法穿透。此时**必须配置 TURN 服务器**（中继服务器）。

#### Q: 报错 `must provide 'iceServers'`？

**A:** 从 v1.0 版本开始，P2PTY 不再内置默认 STUN 服务器。你必须在初始化时显式传入 `iceServers` 数组。

#### Q: 传输大文件时内存占用过高？

**A:** P2PTY 默认分片大小为 16MB。接收端会将分片暂存在内存中进行校验。如果设备内存受限，可以尝试在源码中减小 `CHUNK_SIZE`（如改为 4MB），但这会稍微增加哈希计算的频次。

#### Q: 如何判断连接是否加密安全？

**A:** 在 `onConnect` 回调中调用 `p2p.getFingerprint()`。你可以让用户在界面上口头或通过其他渠道核对双方的指纹（Fingerprint）前几位是否一致。这是 WebRTC 安全的最佳实践。

## ⚠️ 注意事项

1. **信令服务器**：本库不包含信令服务器（Signal Server）。你需要自己搭建一个简单的 WebSocket 服务来在 Host 和 Peer 之间交换 `onSignal` 产生的数据。
2. **ICE 服务器**：为了保证在复杂网络（如 4G/5G、对称型 NAT）下的连通率，请务必在 `iceServers` 中配置可用的 TURN 服务器。



## ☁️ Cloudflare Pages 部署

本项目支持使用 **Cloudflare Pages** 进行一键部署。

点击下方按钮，系统将引导您授权 GitHub，并将本项目克隆到您的 Cloudflare 账号中自动构建：

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://deploy.workers.cloudflare.com/?url=https://github.com/Sparklewink/p2pty)

### ⚠️ 关键配置说明

由于本项目采用了 Monorepo 结构，在一键部署的配置向导中，您 **必须手动修改** 构建设置，否则会导致构建失败。

请在 **Set up builds and deployments** (构建配置) 页面中，参照下表修改：

| 配置项 (Field) | 填写内容 (Value) | 重要性 |
| --- | --- | --- |
| **Framework preset** | `Vue` | 推荐 |
| **Build command** | `npm run build` | 默认 |
| **Build output directory** | `dist` | 默认 |
| **Root directory** | `transfer` | 手动修改|

> **注意**：请务必将 `Root directory`设置为 `transfer`，这样 Cloudflare 才会正确进入子目录进行构建。

---

### 💡 手动部署方法 (备选)

如果您无法使用上方的一键部署按钮，可以按照以下步骤手动操作：

1. **Fork** 本仓库到您的 GitHub 账号。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3. 选择您刚刚 Fork 的 `p2pty` 仓库。
4. 在 **Build settings** 步骤中，严格按照上方表格填写配置（**切记将 Root directory 填为 `transfer**`）。
5. 点击 **Save and Deploy** 即可。

## 📄 License

Apache-2.0
