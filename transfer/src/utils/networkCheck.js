/**
 * 检测是否存在 VPN 或代理干扰 WebRTC
 * 原理：检查是否能获取到 host 类型 (局域网) 的 Candidate
 * * @returns {Promise<boolean>} true = 疑似开启了 VPN/代理; false = 网络环境正常
 */
export const checkVPN = async () => {
    return new Promise((resolve) => {
      let hasHostCandidate = false;
      let hasSrflxCandidate = false;
      let candidatesCount = 0;
  
      // 使用公共 STUN 快速测试
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
  
      // 创建 DataChannel 触发 ICE 收集
      pc.createDataChannel('');
  
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        
        candidatesCount++;
        const line = e.candidate.candidate;
        
        // host = 局域网 IP (如 192.168.x.x 或 mDNS .local)
        if (line.includes(' typ host ')) {
          hasHostCandidate = true;
        }
        // srflx = 公网映射 IP
        if (line.includes(' typ srflx ')) {
          hasSrflxCandidate = true;
        }
      };
  
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
  
      // 2秒后结算
      setTimeout(() => {
        pc.close();
        
        // 判定逻辑：
        // 1. 如果完全没有 Candidate，说明 WebRTC 被禁用或 UDP 被封锁 -> 视为 VPN/防火墙问题
        if (candidatesCount === 0) {
          resolve(true); 
          return;
        }
  
        // 2. 如果只有公网 IP (srflx) 而没有局域网 IP (host)
        // 这通常意味着系统代理接管了流量，隐藏了本地网卡
        if (hasSrflxCandidate && !hasHostCandidate) {
          resolve(true);
          return;
        }
  
        // 其他情况视为正常
        resolve(false);
      }, 1500);
    });
  };