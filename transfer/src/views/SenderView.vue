<template>
    <div class="space-y-6 pb-20">
      <div class="flex justify-between items-center px-2 mb-6">
        <h2 class="text-2xl font-bold text-gray-800">发送文件</h2>
        <span class="text-xs font-mono text-gray-400 bg-white/50 px-2 py-1 rounded-md">
          STEP {{ currentStep }}/4
        </span>
      </div>
  
      <section v-if="currentStep === 1" class="glass-card p-6 animate-fade-in space-y-6">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">1. 网络配置</h3>
          <p class="text-sm text-gray-500">请选择 STUN 服务器以获取公网 IP，确保 P2P 通道畅通。</p>
        </div>
  
        <div class="space-y-3">
          <div 
            v-for="server in stunOptions" 
            :key="server.name"
            @click="!isInitializing && !publicIp && (selectedStun = server)"
            class="cursor-pointer p-4 rounded-xl border transition-all duration-200 flex items-center justify-between"
            :class="[
              selectedStun.name === server.name ? 'bg-blue-50/80 border-apple-blue shadow-sm' : 'bg-white/40 border-transparent hover:bg-white/60',
              (isInitializing || publicIp) ? 'opacity-60 cursor-default' : ''
            ]"
          >
            <div class="flex items-center gap-3">
              <div class="w-2 h-2 rounded-full" :class="selectedStun.name === server.name ? 'bg-apple-blue' : 'bg-gray-300'"></div>
              <div>
                <div class="font-medium text-gray-800">{{ server.name }}</div>
                <div class="text-xs text-gray-400">{{ server.desc }}</div>
              </div>
            </div>
            <CheckIcon v-if="selectedStun.name === server.name" class="w-5 h-5 text-apple-blue" />
          </div>
        </div>
  
        <div v-if="isInitializing || publicIp" class="bg-gray-50/80 rounded-xl p-4 border border-gray-200 flex items-center justify-between animate-fade-in">
          <div class="flex items-center gap-3">
            <div v-if="!publicIp" class="w-8 h-8 rounded-full border-2 border-blue-200 border-t-apple-blue animate-spin"></div>
            <GlobeIcon v-else class="w-8 h-8 text-green-500" />
            
            <div>
              <div class="text-xs text-gray-500 font-medium">公网 IP 地址</div>
              <div class="text-sm font-bold text-gray-800 font-mono">
                {{ publicIp || '正在探测 NAT 类型...' }}
              </div>
            </div>
          </div>
          
          <div v-if="publicIp" class="text-xs text-green-600 font-bold bg-green-100 px-2 py-1 rounded">
            Ready
          </div>
        </div>
  
        <button 
          v-if="!publicIp"
          @click="initNetwork" 
          class="btn-primary w-full"
          :disabled="isInitializing"
        >
          <LoaderIcon v-if="isInitializing" class="w-5 h-5 animate-spin" />
          <span v-else>初始化网络并获取 IP</span>
        </button>
  
        <button 
          v-else
          @click="nextStep" 
          class="btn-primary w-full bg-green-600 hover:bg-green-700 animate-fade-in"
        >
          <span>下一步：选择文件</span>
          <ArrowRightIcon class="w-5 h-5" />
        </button>
      </section>
  
      <section v-if="currentStep === 2" class="glass-card p-6 animate-fade-in space-y-6">
        <div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">2. 选择文件</h3>
          <p class="text-sm text-gray-500">支持任意格式，文件不经过服务器存储。</p>
        </div>
  
        <div 
          class="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors hover:border-apple-blue hover:bg-blue-50/30 cursor-pointer"
          @click="triggerFileInput"
          @drop.prevent="handleDrop"
          @dragover.prevent
        >
          <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <FileIcon class="w-8 h-8 text-apple-blue" />
          </div>
          <p class="text-gray-700 font-medium mb-1">点击或拖拽文件至此</p>
          <p class="text-xs text-gray-400">P2PTY 加密通道</p>
          <input ref="fileInput" type="file" class="hidden" @change="handleFileSelect" />
        </div>
  
        <div v-if="selectedFile" class="bg-white/60 p-4 rounded-xl flex items-center gap-4 border border-white/50 animate-fade-in">
          <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 uppercase">
            {{ selectedFile.name.split('.').pop() || 'FILE' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="truncate font-medium text-gray-800">{{ selectedFile.name }}</div>
            <div class="text-xs text-gray-500">{{ formatSize(selectedFile.size) }}</div>
          </div>
          <button @click="selectedFile = null" class="text-gray-400 hover:text-red-500 p-2">
            <XIcon class="w-5 h-5" />
          </button>
        </div>
  
        <button 
          v-if="selectedFile" 
          @click="generateConfig" 
          class="btn-primary w-full animate-fade-in"
        >
          生成连接配置
        </button>
      </section>
  
      <section v-if="currentStep === 3" class="glass-card p-6 animate-fade-in space-y-6">
        <div class="text-center">
          <h3 class="text-lg font-semibold text-gray-800">3. 等待接收方连接</h3>
          <p class="text-sm text-gray-500 mt-1">请将以下配置分享给接收方</p>
        </div>
  
        <div class="flex p-1 bg-gray-100/50 rounded-lg">
          <button 
            v-for="tab in ['QR Code', 'Text', 'YAML']" 
            :key="tab"
            @click="activeShareTab = tab"
            class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all"
            :class="activeShareTab === tab ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          >
            {{ tab }}
          </button>
        </div>
  
        <div class="bg-white/50 p-4 rounded-xl border border-white/50 min-h-[220px] flex flex-col items-center justify-center">
          <div v-if="activeShareTab === 'QR Code'" class="animate-fade-in">
            <div class="p-2 bg-white rounded-lg shadow-sm">
               <QrcodeVue :value="connectionString" :size="200" level="M" />
            </div>
            <p class="text-xs text-center text-gray-400 mt-2">使用接收方摄像头扫描</p>
          </div>
  
          <div v-else-if="activeShareTab === 'Text'" class="w-full animate-fade-in">
            <textarea 
              readonly 
              class="input-apple w-full h-32 text-xs font-mono break-all resize-none mb-3"
              :value="connectionString"
            ></textarea>
            <button @click="copyToClipboard(connectionString)" class="btn-secondary w-full text-xs py-2">
              <CopyIcon class="w-4 h-4" /> 复制连接字符串
            </button>
          </div>
  
          <div v-else class="w-full animate-fade-in">
            <pre class="bg-gray-800 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto h-32 mb-3">{{ yamlConfig }}</pre>
            <button @click="downloadYaml" class="btn-secondary w-full text-xs py-2">
              <DownloadIcon class="w-4 h-4" /> 下载 YAML 文件
            </button>
          </div>
        </div>
  
        <div class="bg-yellow-50/50 border border-yellow-100 p-3 rounded-lg flex items-start gap-3">
          <AlertTriangleIcon class="w-5 h-5 text-yellow-600 shrink-0" />
          <div class="text-xs text-yellow-700">
            <p class="font-bold">请勿关闭此页面</p>
            一旦接收方连接成功，文件传输将自动开始。
          </div>
        </div>
      </section>
  
      <section v-if="currentStep === 4" class="glass-card p-6 animate-fade-in text-center space-y-8">
        <div class="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto relative">
          <svg class="w-full h-full text-blue-100 transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="currentColor" stroke-width="8" fill="none" />
            <circle cx="50" cy="50" r="45" stroke="#007AFF" stroke-width="8" fill="none" 
              stroke-dasharray="283" 
              :stroke-dashoffset="283 - (283 * progress / 100)" 
              class="transition-all duration-300 ease-out"
            />
          </svg>
          <span class="absolute text-lg font-bold text-apple-blue">{{ progress.toFixed(0) }}%</span>
        </div>
        
        <div>
          <h3 class="text-lg font-bold text-gray-900">正在发送...</h3>
          <p class="text-sm text-gray-500 truncate max-w-[200px] mx-auto">{{ selectedFile?.name }}</p>
        </div>
  
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden w-full">
          <div class="h-full bg-apple-blue transition-all duration-300" :style="{ width: progress + '%' }"></div>
        </div>
        
        <button v-if="progress >= 100" @click="reset" class="btn-primary w-full">
          发送新文件
        </button>
      </section>
  
      <BaseModal 
        :show="showVpnModal" 
        :maskClosable="false"
        @confirm="closeVpnModal"
        @close="goBackHome"
      >
        <template #icon>
          <ShieldAlertIcon class="w-6 h-6 text-red-500" />
        </template>
        <template #title>网络环境警告</template>
        <template #content>
          检测到您的网络可能被 VPN 或代理接管，这会导致 P2P 连接失败。
          <br/><br/>
          为了确保能够获取公网 IP，请<span class="font-bold text-gray-900">暂时关闭 VPN</span>。
        </template>
        <template #footer>
          <button @click="goBackHome" class="flex-1 btn-secondary text-sm py-2">返回</button>
          <button @click="closeVpnModal" class="flex-1 btn-primary text-sm py-2">我已关闭</button>
        </template>
      </BaseModal>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter } from 'vue-router'
  import { P2PTY, CryptoUtils } from '../utils/p2pty.js'
  import { checkVPN } from '../utils/networkCheck.js'
  import QrcodeVue from 'qrcode.vue'
  import jsyaml from 'js-yaml'
  import BaseModal from '../components/BaseModal.vue'
  import { 
    Check as CheckIcon, Loader as LoaderIcon, File as FileIcon, X as XIcon,
    Copy as CopyIcon, Download as DownloadIcon, AlertTriangle as AlertTriangleIcon,
    ShieldAlert as ShieldAlertIcon, Globe as GlobeIcon, ArrowRight as ArrowRightIcon
  } from 'lucide-vue-next'
  
  const router = useRouter()
  
  // --- 状态 ---
  const currentStep = ref(1)
  const showVpnModal = ref(false)
  const isInitializing = ref(false)
  const publicIp = ref('')
  const selectedFile = ref(null)
  const connectionString = ref('')
  const progress = ref(0)
  const fileInput = ref(null)
  const activeShareTab = ref('QR Code')
  let p2p = null
  
  const stunOptions = [
    { name: '腾讯云 (推荐)', urls: 'stun:stun.qq.com:3478', desc: '国内极速' },
    { name: '小米 (Xiaomi)', urls: 'stun:stun.miwifi.com:3478', desc: '稳定可靠' },
    { name: 'Cloudflare', urls: 'stun:stun.cloudflare.com:3478', desc: '全球加速' }
  ]
  const selectedStun = ref(stunOptions[0])
  
  const yamlConfig = computed(() => {
    if (!connectionString.value) return ''
    return jsyaml.dump({
      protocol: 'P2PTY',
      role: 'PEER',
      connection_string: connectionString.value,
      stun_server: selectedStun.value.urls,
      created_at: new Date().toISOString()
    })
  })
  
  // --- 方法 ---
  
  const closeVpnModal = () => showVpnModal.value = false
  const goBackHome = () => router.push('/')
  
  // 核心逻辑：Host 初始化并获取 IP
  const initNetwork = async () => {
    isInitializing.value = true
    publicIp.value = ''
  
    try {
      const identity = await CryptoUtils.generateIdentityKeyPair()
      
      if (p2p) p2p.close()
      
      p2p = new P2PTY({
        role: 'HOST',
        identity: identity,
        iceServers: [{ urls: selectedStun.value.urls }]
      })
  
      // 监听 Signal 提取 IP
      p2p.on('onSignal', (data) => {
        if (data.candidate && data.candidate.candidate) {
          const parts = data.candidate.candidate.split(' ')
          // candidate:foundation component protocol priority ip port typ type ...
          if (parts.length >= 8) {
             const type = parts[7] // host / srflx
             const ip = parts[4]
             
             if (type === 'srflx') {
               publicIp.value = ip
               isInitializing.value = false
             }
          }
        }
      })
  
      p2p.on('onConnect', async () => {
        currentStep.value = 4
        if (selectedFile.value) {
          await p2p.sendFile(selectedFile.value)
        }
      })
  
      p2p.on('onFileProgress', (loaded, total) => {
        progress.value = (loaded / total) * 100
      })
  
      p2p.on('onFileVerified', () => {
        alert('传输完成且校验通过！')
      })
  
      await p2p.start()
      // 注意：这里不自动跳转，等待用户确认 IP 后点击下一步
    } catch (e) {
      alert(`初始化错误: ${e.message}`)
      isInitializing.value = false
    }
  }
  
  const nextStep = () => { if(publicIp.value) currentStep.value = 2 }
  
  const triggerFileInput = () => fileInput.value.click()
  const handleFileSelect = (e) => { if (e.target.files.length > 0) selectedFile.value = e.target.files[0] }
  const handleDrop = (e) => { if (e.dataTransfer.files.length > 0) selectedFile.value = e.dataTransfer.files[0] }
  
  const generateConfig = async () => {
    if (!p2p) return
    try {
      const link = await p2p.generateLink("NO_RELAY", 600)
      connectionString.value = link
      currentStep.value = 3
    } catch (e) {
      alert(`生成配置失败: ${e.message}`)
    }
  }
  
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('已复制')
    } catch (err) { console.error(err) }
  }
  
  const downloadYaml = () => {
    const blob = new Blob([yamlConfig.value], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'p2pty-config.yaml'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  const reset = () => {
    currentStep.value = 2
    selectedFile.value = null
    progress.value = 0
  }
  
  // 延迟检测 VPN，防止转场卡顿
  onMounted(() => {
    setTimeout(async () => {
      const isVpn = await checkVPN()
      if (isVpn) showVpnModal.value = true
    }, 600)
  })
  
  onBeforeUnmount(() => {
    if (p2p) p2p.close()
  })
  </script>