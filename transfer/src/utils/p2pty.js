/**
 * P2PTY.js - Peer-to-Peer Transfer Protocol
 */

import { sha256 } from 'https://esm.sh/@noble/hashes@2.0.1/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes@2.0.1/utils.js';

const PROTOCOL_NAME = 'P2PTY';
const PROTOCOL_VERSION = 'v1';
const CH_CTRL = 'p2pty-control';
const CH_DATA = 'p2pty-data';

// 超时设置
const TIMEOUT_HANDSHAKE = 60000; // 握手超时 60秒
const TIMEOUT_IDLE = 30000;      // 空闲超时 30秒

// 传输设置
const CHUNK_SIZE = 16 * 1024 * 1024; //分片大小
const SLICE_SIZE = 1024 * 1024; 
const BUFFER_THRESHOLD = 16 * 1024 * 1024; // 缓冲区阈值
const MAX_RETRIES = 5;               // 最大重试次数

const OP = {
    SYN: 'SYN', SYN_ACK: 'SYN_ACK', ACK: 'ACK',
    KEY_EX: 'KEY_EX',
    KEY_CONFIRM: 'KEY_CONFIRM', 

    META: 'META',  
    REQUEST: 'REQUEST',  
    
    CHUNK_HASH: 'CHUNK_HASH', 
    CHUNK_ACK: 'CHUNK_ACK', 
    
    PAUSE: 'PAUSE', RESUME: 'RESUME', CANCEL: 'CANCEL',
    
    FIN: 'FIN', FIN_ACK: 'FIN_ACK'
};

const STATE = {
    IDLE: 'IDLE', SIGNALING: 'SIGNALING',
    HANDSHAKE_SYN_SENT: 'HANDSHAKE_SYN_SENT', HANDSHAKE_SYN_RCVD: 'HANDSHAKE_SYN_RCVD',
    KEY_EXCHANGE: 'KEY_EXCHANGE',
    KEY_CONFIRMING: 'KEY_CONFIRMING',
    ESTABLISHED: 'ESTABLISHED',
    META_SENT: 'META_SENT',
    TRANSFERRING: 'TRANSFERRING', PAUSED: 'PAUSED',
    CLOSED: 'CLOSED'
};

export class ProtocolError extends Error {
    constructor(code, message, state = null) {
        super(message);
        this.name = 'ProtocolError';
        this.code = code;
        this.state = state; 
    }
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();

export class CryptoUtils {
    static async generateIdentityKeyPair() {
        return await window.crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]
        );
    }
    static async generateEphemeralKeyPair() {
        return await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-384" }, true, ["deriveKey", "deriveBits"]
        );
    }
    static async exportKey(key) {
        const raw = await window.crypto.subtle.exportKey("raw", key);
        return this.buf2base64(raw);
    }
    static async importKey(base64, algorithm) {
        try {
            const raw = this.base642buf(base64);
            const usages = algorithm.name === 'ECDSA' ? ['verify'] : [];
            const alg = { ...algorithm, namedCurve: "P-384" };
            return await window.crypto.subtle.importKey("raw", raw, alg, true, usages);
        } catch (e) { throw new ProtocolError('CRYPTO_ERR', `密钥导入失败: ${e.message}`); }
    }

    static async sign(privateKey, dataStr) {
        const sig = await window.crypto.subtle.sign(
            { name: "ECDSA", hash: { name: "SHA-384" } }, privateKey, ENC.encode(dataStr)
        );
        return this.buf2base64(sig);
    }
    static async verify(publicKey, sigBase64, dataStr) {
        const sig = this.base642buf(sigBase64);
        return await window.crypto.subtle.verify(
            { name: "ECDSA", hash: { name: "SHA-384" } }, publicKey, sig, ENC.encode(dataStr)
        );
    }

    static async deriveSessionKeys(localPrivateKey, remotePublicKey) {
        const sharedBits = await window.crypto.subtle.deriveBits(
            { name: "ECDH", public: remotePublicKey }, localPrivateKey, 384
        );
        const hkdfKey = await window.crypto.subtle.importKey(
            "raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]
        );
        const ctrlKey = await window.crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: ENC.encode("P2PTY_CTRL_v6") },
            hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
        const dataKey = await window.crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: ENC.encode("P2PTY_DATA_v6") },
            hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
        const validationKey = await window.crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: ENC.encode("P2PTY_VAL_v6") },
            hkdfKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
        );

        return { ctrlKey, dataKey, validationKey };
    }

    static async calculateKeyConfirmation(validationKey, role) {
        const data = ENC.encode(`KEY_CONFIRM_${role}`);
        const sig = await window.crypto.subtle.sign("HMAC", validationKey, data);
        return this.buf2base64(sig);
    }

    static async verifyKeyConfirmation(validationKey, remoteRole, sigBase64) {
        const sig = this.base642buf(sigBase64);
        const data = ENC.encode(`KEY_CONFIRM_${remoteRole}`);
        return await window.crypto.subtle.verify("HMAC", validationKey, sig, data);
    }

    static async encrypt(key, dataBuffer) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, dataBuffer
        );
        const pack = new Uint8Array(12 + ciphertext.byteLength);
        pack.set(iv, 0);
        pack.set(new Uint8Array(ciphertext), 12);
        return pack;
    }

    static async decrypt(key, packBuffer) {
        const pack = new Uint8Array(packBuffer);
        if (pack.byteLength < 12) throw new Error("数据包过短");
        const iv = pack.slice(0, 12);
        const ciphertext = pack.slice(12);
        return await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, key, ciphertext
        );
    }

    static async computeFingerprint(key1Base64, key2Base64) {
        const keys = [key1Base64, key2Base64].sort().join(':');
        const hash = await window.crypto.subtle.digest('SHA-256', ENC.encode(keys));
        return bytesToHex(new Uint8Array(hash));
    }

    static buf2base64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    static base642buf(base64) {
        const bin = window.atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }
}

export class P2PTY {
    constructor(config) {
        if (!['HOST', 'PEER'].includes(config.role)) throw new Error("无效的角色");
        if (!config.iceServers || !Array.isArray(config.iceServers) || config.iceServers.length === 0) {
            throw new Error("P2PTY 错误: 必须提供 'iceServers' 配置列表 。");
        }
        this.role = config.role;
        this.config = config;
        this.state = STATE.IDLE;
        this.identity = config.identity || null;
        this.remotePubKey = null; 
        this.fingerprint = null; 

        this.ephemeralKeyPair = null;
        this.keys = { ctrl: null, data: null, validation: null };
        this.isEncrypted = false;
        
        this.seqLocal = 0;
        this.seqRemote = 0;
        this.pc = new RTCPeerConnection({
            iceServers: config.iceServers 
        });

        this.dcCtrl = null;
        this.dcData = null;

        this.nonceLocal = crypto.randomUUID();
        this.nonceRemote = null;

        this.transfer = {
            fileToSend: null,
            fileMeta: null,
            chunkId: 0, 
            currentChunkData: [], 
            currentChunkSize: 0,
            chunkHasher: null,   
            globalHasher: null,  
            isPaused: false,
            retryCount: 0
        };

        this.chunkSize = CHUNK_SIZE;

        this.remoteDescriptionSet = false;
        this.candidateQueue = [];
        this.timers = { handshake: null, idle: null };

        this.hooks = {
            onSignal: () => {}, onConnect: () => {},
            onFingerprint: () => {}, 
            onFileProgress: () => {}, onFileChunk: () => {}, onFileVerified: () => {},
            onError: () => {}, onClose: () => {},
            onReconnectNeeded: () => {}
        };

        this._initPC();
        if (this.role === 'PEER' && config.connectionString) {
            this._parseConnectionString(config.connectionString);
        }
    }

    on(event, callback) { if (this.hooks[event]) this.hooks[event] = callback; }

    getFingerprint() {
        return this.fingerprint;
    }

    async generateLink(relayPayload, expireSeconds = 300) {
        if (this.role !== 'HOST' || !this.identity) throw new Error("主机身份缺失");
        const pubK = await CryptoUtils.exportKey(this.identity.publicKey);
        const expire = Math.floor(Date.now() / 1000) + expireSeconds;
        const relayB64 = typeof relayPayload === 'string' ? 
            CryptoUtils.buf2base64(ENC.encode(relayPayload)) : relayPayload;
        
        const rawData = `${PROTOCOL_VERSION}.${pubK}.${relayB64}.${expire}`;
        const sig = await CryptoUtils.sign(this.identity.privateKey, rawData);
        return `${rawData}.${sig}`;
    }

    async start() {
        this._transition(STATE.SIGNALING);
        this.timers.handshake = setTimeout(() => {
            if (this.state !== STATE.ESTABLISHED) this._error('TIMEOUT_HANDSHAKE', '握手超时');
        }, TIMEOUT_HANDSHAKE);

        this.ephemeralKeyPair = await CryptoUtils.generateEphemeralKeyPair();

        if (this.role === 'HOST') {
            this.dcCtrl = this.pc.createDataChannel(CH_CTRL, { ordered: true, negotiated: true, id: 0 });
            this.dcData = this.pc.createDataChannel(CH_DATA, { ordered: true, negotiated: true, id: 1 });
            this._setupChannels();
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this._emitSignal({ sdp: offer });
        } else {
            this.dcCtrl = this.pc.createDataChannel(CH_CTRL, { ordered: true, negotiated: true, id: 0 });
            this.dcData = this.pc.createDataChannel(CH_DATA, { ordered: true, negotiated: true, id: 1 });
            this._setupChannels();
        }
    }

    close() {
        if (this.state === STATE.CLOSED) return;
        if (this.state === STATE.TRANSFERRING || this.state === STATE.PAUSED) {
            this._sendCtrl({ t: OP.CANCEL });
        }
        this._forceClose('USER_ABORT', '用户关闭连接');
    }

    async handleSignal(data) {
        if (!data) return;
        try {
            if (data.sdp) {
                await this.pc.setRemoteDescription(data.sdp);
                this.remoteDescriptionSet = true;
                while (this.candidateQueue.length > 0) await this.pc.addIceCandidate(this.candidateQueue.shift());
                if (data.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    this._emitSignal({ sdp: answer });
                }
            } else if (data.candidate) {
                if (this.remoteDescriptionSet) await this.pc.addIceCandidate(data.candidate);
                else this.candidateQueue.push(data.candidate);
            }
        } catch (e) { this._error('SIGNAL_ERR', e.message); }
    }

    _initPC() {
        this.pc.onicecandidate = (e) => {
            if (e.candidate) this._emitSignal({ candidate: e.candidate });
        };
        this.pc.onconnectionstatechange = () => {
            if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) {
                this.hooks.onReconnectNeeded(this.transfer.chunkId);
                this._forceClose('PC_CONN_LOST', '连接中断');
            }
        };
    }

    async _parseConnectionString(str) {
        try {
            const parts = str.split('.');
            if (parts.length !== 5) throw new Error('格式错误');
            const [ver, pubK, relayB64, expire, sig] = parts;
            if (ver !== PROTOCOL_VERSION) throw new Error('版本不匹配');
            if (Date.now() / 1000 > parseInt(expire)) throw new Error('链接已过期');
            
            const remotePubKey = await CryptoUtils.importKey(pubK, { name: "ECDSA" });
            const dataStr = `${ver}.${pubK}.${relayB64}.${expire}`;
            const isValid = await CryptoUtils.verify(remotePubKey, sig, dataStr);
            if (!isValid) throw new Error('签名无效');

            this.remotePubKey = remotePubKey;
            this.relayInfo = DEC.decode(CryptoUtils.base642buf(relayB64));
        } catch (e) { this._forceClose('LINK_INVALID', e.message); }
    }

    _setupChannels() {
        this.dcCtrl.onopen = () => { if (this.role === 'HOST') this._startHandshake(); };
        
        this.dcCtrl.onmessage = async (e) => {
            try {
                let msg;
                if (this.isEncrypted) {
                    const plainBuffer = await CryptoUtils.decrypt(this.keys.ctrl, e.data);
                    msg = JSON.parse(DEC.decode(plainBuffer));
                    if (!Number.isInteger(msg.seq) || msg.seq <= this.seqRemote) {
                        throw new Error(`重放攻击检测: ${msg.seq}`);
                    }
                    this.seqRemote = msg.seq;
                } else {
                    msg = JSON.parse(e.data);
                }
                await this._handleCtrlMessage(msg);
            } catch (err) { this._error('CTRL_ERR', err.message); }
        };

        this.dcData.onmessage = async (e) => {
            this._resetIdleTimer();
            await this._handleDataMessage(e.data);
        };
        this.dcData.onerror = (e) => this._error('DATA_ERR', e.message);
    }

    _emitSignal(data) { this.hooks.onSignal(data); }
    _transition(newState) { this.state = newState; }
    _resetIdleTimer() {
        if (this.timers.idle) clearTimeout(this.timers.idle);
        if (this.state === STATE.TRANSFERRING) {
            this.timers.idle = setTimeout(() => this._error('TIMEOUT_IDLE', '30秒无数据传输'), TIMEOUT_IDLE);
        }
    }

    async _sendCtrl(msg) {
        if (!this.dcCtrl || this.dcCtrl.readyState !== 'open') return;
        if (this.isEncrypted) {
            this.seqLocal++;
            msg.seq = this.seqLocal;
            const encrypted = await CryptoUtils.encrypt(this.keys.ctrl, ENC.encode(JSON.stringify(msg)));
            this.dcCtrl.send(encrypted);
        } else {
            this.dcCtrl.send(JSON.stringify(msg));
        }
    }

    async _startHandshake() {
        this._transition(STATE.HANDSHAKE_SYN_SENT);
        const pubKeyStr = await CryptoUtils.exportKey(this.identity.publicKey);
        this._sendCtrl({ t: OP.SYN, ver: PROTOCOL_VERSION, nonce: this.nonceLocal, pubkey: pubKeyStr });
    }

    async _handleCtrlMessage(msg) {
        switch (msg.t) {
            case OP.SYN:
                if (this.role === 'HOST') return this._error('PROTO_ERR', '主机收到了 SYN');
                const expectedPubK = await CryptoUtils.exportKey(this.remotePubKey);
                if (msg.pubkey !== expectedPubK) return this._error('MITM_ALERT', '公钥不匹配');
                this.nonceRemote = msg.nonce;
                this._transition(STATE.HANDSHAKE_SYN_RCVD);
                this._sendCtrl({ t: OP.SYN_ACK, nonce_ack: this.nonceRemote, nonce: this.nonceLocal });
                break;

            case OP.SYN_ACK:
                if (this.state !== STATE.HANDSHAKE_SYN_SENT) return;
                this.nonceRemote = msg.nonce;
                const sig = await CryptoUtils.sign(this.identity.privateKey, this.nonceRemote);
                this._sendCtrl({ t: OP.ACK, nonce_ack: this.nonceRemote, sig: sig });
                this._startKeyExchange();
                break;

            case OP.ACK:
                if (this.state !== STATE.HANDSHAKE_SYN_RCVD) return;
                const isAuth = await CryptoUtils.verify(this.remotePubKey, msg.sig, this.nonceLocal);
                if (!isAuth) return this._error('AUTH_ERR', '验证失败');
                this._startKeyExchange();
                break;

            case OP.KEY_EX:
                if (this.state !== STATE.KEY_EXCHANGE) return;
                const remoteEphKey = await CryptoUtils.importKey(msg.key, { name: "ECDH" });
                const keys = await CryptoUtils.deriveSessionKeys(this.ephemeralKeyPair.privateKey, remoteEphKey);
                this.keys = keys;
                this.isEncrypted = true;
                this._startKeyConfirmation();
                break;

            case OP.KEY_CONFIRM:
                if (this.state !== STATE.KEY_CONFIRMING) return;
                const remoteRole = this.role === 'HOST' ? 'PEER' : 'HOST';
                const isValidConfirm = await CryptoUtils.verifyKeyConfirmation(this.keys.validationKey, remoteRole, msg.mac);
                if (!isValidConfirm) return this._error('SEC_ERR', '密钥确认失败');
                
                const myPub = await CryptoUtils.exportKey(this.identity.publicKey);
                const remotePub = await CryptoUtils.exportKey(this.remotePubKey);
                this.fingerprint = await CryptoUtils.computeFingerprint(myPub, remotePub);
                this.hooks.onFingerprint(this.fingerprint);

                this._handshakeComplete();
                break;

            case OP.META:
                if (this.state !== STATE.ESTABLISHED) return;
                this.transfer.fileMeta = msg.files[0];
                this.transfer.chunkId = 0;
                this.transfer.currentChunkData = [];
                this.transfer.currentChunkSize = 0;
                this.transfer.chunkHasher = sha256.create();
                this.transfer.globalHasher = sha256.create();
                this.transfer.retryCount = 0;

                this._sendCtrl({ t: OP.REQUEST, chunkId: 0 });
                this._transition(STATE.TRANSFERRING);
                this._resetIdleTimer();
                break;

            case OP.REQUEST:
                this.transfer.chunkId = msg.chunkId || 0;
                this.transfer.isPaused = false;
                this._transition(STATE.TRANSFERRING);
                this._pushChunkData(this.transfer.chunkId);
                break;

            case OP.CHUNK_HASH:
                if (this.state !== STATE.TRANSFERRING) return;
                if (msg.chunkId !== this.transfer.chunkId) return; 

                const chunkLocalHash = bytesToHex(this.transfer.chunkHasher.digest());
                if (chunkLocalHash === msg.hash) {
                    for (const buffer of this.transfer.currentChunkData) {
                        this.transfer.globalHasher.update(new Uint8Array(buffer));
                    }

                    const blob = new Blob(this.transfer.currentChunkData);
                    const buffer = await blob.arrayBuffer();
                    this.hooks.onFileChunk(buffer);
                    this.transfer.retryCount = 0;
                    this._sendCtrl({ t: OP.CHUNK_ACK, chunkId: this.transfer.chunkId });
                    
                    this.transfer.chunkId++;
                    this.transfer.currentChunkData = [];
                    this.transfer.currentChunkSize = 0;
                    this.transfer.chunkHasher = sha256.create();
                } else {
                    console.warn(`分片 ${msg.chunkId} 哈希不匹配。`);
                    this.transfer.retryCount++;
                    if (this.transfer.retryCount > MAX_RETRIES) {
                        return this._forceClose('MAX_RETRIES', '完整性校验失败次数过多');
                    }
                    this.transfer.currentChunkData = [];
                    this.transfer.currentChunkSize = 0;
                    this.transfer.chunkHasher = sha256.create();
                    this._sendCtrl({ t: OP.REQUEST, chunkId: this.transfer.chunkId });
                }
                break;

            case OP.CHUNK_ACK:
                if (this.state !== STATE.TRANSFERRING) return;
                if (msg.chunkId === this.transfer.chunkId) {
                    const nextId = this.transfer.chunkId + 1;
                    if (nextId * this.chunkSize >= this.transfer.fileToSend.size) {
                         const totalHash = bytesToHex(this.transfer.globalHasher.digest());
                        this._sendCtrl({ t: OP.FIN, hash: totalHash });
                    } else {
                        this._pushChunkData(nextId);
                    }
                }
                break;

            case OP.PAUSE:
                if (this.state === STATE.TRANSFERRING) {
                    this.transfer.isPaused = true;
                    this._transition(STATE.PAUSED);
                }
                break;

            case OP.RESUME:
                if (this.state === STATE.PAUSED) {
                    this.transfer.isPaused = false;
                    this._transition(STATE.TRANSFERRING);
                    this._pushChunkData(this.transfer.chunkId);
                }
                break;

            case OP.CANCEL: this._forceClose('USER_CANCEL', '已取消'); break;

            case OP.FIN:
                const calculatedTotalHash = bytesToHex(this.transfer.globalHasher.digest());
                if (msg.hash && msg.hash !== calculatedTotalHash) {
                    this._forceClose('FILE_HASH_MISMATCH', '文件完整性校验失败');
                    return;
                }
                this._sendCtrl({ t: OP.FIN_ACK });
                this.hooks.onFileVerified(true); 
                this._closeConnection();
                break;
        }
    }

    async _startKeyExchange() {
        this._transition(STATE.KEY_EXCHANGE);
        const ephPubK = await CryptoUtils.exportKey(this.ephemeralKeyPair.publicKey);
        this._sendCtrl({ t: OP.KEY_EX, key: ephPubK });
    }

    async _startKeyConfirmation() {
        this._transition(STATE.KEY_CONFIRMING);
        const mac = await CryptoUtils.calculateKeyConfirmation(this.keys.validationKey, this.role);
        this._sendCtrl({ t: OP.KEY_CONFIRM, mac: mac });
    }

    _handshakeComplete() {
        if (this.timers.handshake) clearTimeout(this.timers.handshake);
        this._transition(STATE.ESTABLISHED);
        this.hooks.onConnect();
    }

    async _handleDataMessage(encryptedData) {
        if (this.state !== STATE.TRANSFERRING) return;
        try {
            const plainBuffer = await CryptoUtils.decrypt(this.keys.data, encryptedData);
            
            this.transfer.currentChunkData.push(plainBuffer);
            this.transfer.currentChunkSize += plainBuffer.byteLength;
            this.transfer.chunkHasher.update(new Uint8Array(plainBuffer));

            const totalReceived = (this.transfer.chunkId * this.chunkSize) + this.transfer.currentChunkSize;
            if (this.transfer.fileMeta) {
                this.hooks.onFileProgress(totalReceived, this.transfer.fileMeta.size);
            }
        } catch (e) { this._error('DECRYPT_ERR', e.message); }
    }

    async sendFile(fileBlob) {
        if (this.role !== 'HOST') throw new Error("角色错误");
        this.transfer.fileToSend = fileBlob;
        this.transfer.chunkId = 0;
        this.transfer.isPaused = false;
        this.transfer.globalHasher = sha256.create();
        
        this._sendCtrl({
            t: OP.META,
            files: [{ id: 0, name: fileBlob.name, size: fileBlob.size, type: fileBlob.type }]
        });
        this._transition(STATE.META_SENT);
    }

    _pushChunkData(chunkId) {
        this.transfer.chunkId = chunkId;
        const file = this.transfer.fileToSend;
        const startOffset = chunkId * this.chunkSize;
        const endOffset = Math.min(startOffset + this.chunkSize, file.size);
        
        if (startOffset >= file.size) {
            const totalHash = bytesToHex(this.transfer.globalHasher.digest());
            this._sendCtrl({ t: OP.FIN, hash: totalHash });
            return;
        }

        const chunkHasher = sha256.create();
        let currentOffset = startOffset;
        const reader = new FileReader();

        reader.onerror = () => { if (!this.transfer.isPaused) this._error('READ_ERR', '读取失败'); };

        const readSlice = () => {
            if (this.state !== STATE.TRANSFERRING || this.transfer.isPaused) return;
            
            // 检查当前分片是否发送完毕
            if (currentOffset >= endOffset) {
                const hash = bytesToHex(chunkHasher.digest());
                this._sendCtrl({ t: OP.CHUNK_HASH, chunkId: chunkId, hash: hash });
                return;
            }

            // 背压控制
            if (this.dcData.bufferedAmount > BUFFER_THRESHOLD) {
                setTimeout(readSlice, 50);
                return;
            }

            const nextStop = Math.min(currentOffset + SLICE_SIZE, endOffset);
            const slice = file.slice(currentOffset, nextStop);
            reader.readAsArrayBuffer(slice);
        };

        reader.onload = async (e) => {
            if (this.dcData.readyState === 'open') {
                const data = e.target.result;
                const uint8Data = new Uint8Array(data);
                chunkHasher.update(uint8Data);
                this.transfer.globalHasher.update(uint8Data); 

                try {
                    const encrypted = await CryptoUtils.encrypt(this.keys.data, data);
                    this.dcData.send(encrypted);
                    currentOffset += data.byteLength;
                    
                    this.hooks.onFileProgress(currentOffset, file.size);
                    setTimeout(readSlice, 0);
                } catch (err) { this._error('ENCRYPT_ERR', err.message); }
            }
        };

        readSlice();
    }

    _closeConnection() {
        this._transition(STATE.CLOSED);
        this.transfer.fileToSend = null;
        this.transfer.currentChunkData = null;
        this.transfer.chunkHasher = null;
        this.transfer.globalHasher = null;
        this.keys = { ctrl: null, data: null, validation: null };
        if (this.pc) this.pc.close();
        if (this.timers.idle) clearTimeout(this.timers.idle);
        if (this.timers.handshake) clearTimeout(this.timers.handshake);
        this.hooks.onClose();
    }

    _forceClose(code, msg) {
        this.hooks.onError(new ProtocolError(code, msg, { nextChunkId: this.transfer.chunkId }));
        this._closeConnection();
    }

    _error(code, msg) {
        console.warn(`[P2PTY] ${code}: ${msg}`);
        if (code.includes('ERR') || code.includes('ALERT') || code.includes('FAIL')) {
             this._forceClose(code, msg);
        }
    }
}