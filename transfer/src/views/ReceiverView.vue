<template>
  <div class="space-y-6 pb-20">
    <div class="flex justify-between items-center px-2 mb-6">
      <h2 class="text-2xl font-bold text-gray-800">接收文件</h2>
      <span class="text-xs font-mono text-gray-400 bg-white/50 px-2 py-1 rounded-md">
        STEP {{ currentStep }}/3
      </span>
    </div>

    <section v-if="currentStep === 1" class="glass-card p-6 animate-fade-in space-y-6">
      <div>
        <h3 class="text-lg font-semibold text-gray-800 mb-2">1. 网络配置</h3>
        <p class="text-sm text-gray-500">为了建立连接，接收方也需要获取公网 IP。</p>
      </div>

      <div class="space-y-3">
        <div 
          v-for="server in stunOptions" 
          :key="server.name"
          @click="!isInitializing && !publicIp && (selectedStun = server)"
          class="cursor-pointer p-4 rounded-xl border transition-all duration-200 flex items-center justify-between"
          :class="[
            selectedStun.name === server.name ? 'bg-green-50/80 border-green-500 shadow-sm' : 'bg-white/40 border-transparent hover:bg-white/60',
            (isInitializing || publicIp) ? 'opacity-60 cursor-default' : ''
          ]"
        >
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full" :class="selectedStun.name === server.name ? 'bg-green-500' : 'bg-gray-300'"></div>
            <div>
              <div class="font-medium text-gray-800">{{ server.name }}</div>
              <div class="text-xs text-gray-400">{{ server.desc }}</div>
            </div>
          </div>
          <CheckIcon v-if="selectedStun.name === server.name" class="w-5 h-5 text-green-600" />
        </div>
      </div>

      <div v-if="isInitializing || publicIp" class="bg-gray-50/80 rounded-xl p-4 border border-gray-200 flex items-center justify-between animate-fade-in">
        <div class="flex items-center gap-3">
          <div v-if="!publicIp" class="w-8 h-8 rounded-full border-2 border-green-200 border-t-green-600 animate-spin"></div>
          <GlobeIcon v-else class="w-8 h-8 text-green-600" />
          
          <div>
            <div class="text-xs text-gray-500 font-medium">公网 IP 地址</div>
            <div class="text-sm font-bold text-gray-800 font-mono">
              {{ publicIp || '正在连接 STUN...' }}
            </div>
          </div>
        </div>
        
        <div v-if="publicIp" class="text-xs text-green-600 font-bold bg-green-100 px-2 py-1 rounded">
          Ready
        </div>
      </div>

      <button 
        v-if="!publicIp"
        @click="detectPublicIp" 
        class="btn-primary w-full bg-green-600 hover:bg-green-700"
        :disabled="isInitializing"
      >
        <LoaderIcon v-if="isInitializing" class="w-5 h-5 animate-spin" />
        <span v-else>初始化网络并获取 IP</span>
      </button>

      <button 
        v-else
        @click="goToInputStep" 
        class="btn-primary w-full bg-green-600 hover:bg-green-700 animate-fade-in"
      >
        <span>下一步：输入连接配置</span>
        <ArrowRightIcon class="w-5 h-5" />
      </button>
    </section>

    <section v-if="currentStep === 2" class="glass-card p-6 animate-fade-in space-y-6">
      <div class="text-center">
        <h3 class="text-lg font-semibold text-gray-800">2. 连接发送方</h3>
        <p class="text-sm text-gray-500 mt-1">请扫描或输入发送方提供的配置</p>
      </div>

      <div class="flex p-1 bg-gray-100/50 rounded-lg">
        <button 
          v-for="method in inputMethods" 
          :key="method.id"
          @click="activeInputMethod = method.id"
          class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
          :class="activeInputMethod === method.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
        >
          <component :is="method.icon" class="w-3 h-3" />
          {{ method.label }}
        </button>
      </div>

      <div v-if="activeInputMethod === 'scan'" class="animate-fade-in bg-black/5 rounded-xl overflow-hidden relative min-h-[250px] flex flex-col items-center justify-center">
        <div id="qr-reader" class="w-full h-full"></div>
        <div v-if="!isScanning" class="absolute inset-0 flex items-center justify-center bg-gray-100">
           <button @click="startScanner" class="btn-secondary text-sm">
             <CameraIcon class="w-4 h-4" /> 点击开启摄像头
           </button>
        </div>
        <p v-else class="absolute bottom-2 text-xs text-white bg-black/50 px-2 py-1 rounded">扫描中...</p>
      </div>

      <div v-if="activeInputMethod === 'text'" class="animate-fade-in">
        <textarea 
          v-model="inputString"
          placeholder="在此粘贴连接字符串..."
          class="input-apple w-full h-32 text-xs font-mono break-all resize-none mb-3"
        ></textarea>
      </div>

      <div v-if="activeInputMethod === 'file'" class="animate-fade-in">
         <div 
          class="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-white/60 cursor-pointer transition-all"
          @click="triggerYamlInput"
        >
          <FileTextIcon class="w-8 h-8 text-gray-400 mb-2" />
          <p class="text-sm text-gray-600">点击上传 YAML</p>
          <input ref="yamlInput" type="file" accept=".yaml,.yml" class="hidden" @change="handleYamlUpload" />
        </div>
        <p v-if="yamlFileName" class="text-xs text-center text-green-600 mt-2 font-mono">已加载: {{ yamlFileName }}</p>
      </div>

      <button 
        @click="startConnection" 
        class="btn-primary w-full bg-green-600 hover:bg-green-700"
        :disabled="isConnecting || !canConnect"
      >
        <LoaderIcon v-if="isConnecting" class="w-5 h-5 animate-spin" />
        <span v-else>验证并连接</span>
      </button>
      
      <p v-if="errorMsg" class="text-xs text-red-500 text-center animate-pulse">{{ errorMsg }}</p>
    </section>

    <section v-if="currentStep === 3" class="glass-card p-6 animate-fade-in text-center space-y-8">
      <div class="relative w-24 h-24 mx-auto">
        <div class="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20" v-if="status === 'receiving'"></div>
        <div class="w-full h-full bg-white border-4 border-green-500 rounded-full flex items-center justify-center shadow-lg relative z-10">
           <DownloadIcon v-if="status === 'receiving'" class="w-10 h-10 text-green-600 animate-bounce" />
           <CheckIcon v-else-if="status === 'completed'" class="w-10 h-10 text-green-600" />
           <LoaderIcon v-else class="w-10 h-10 text-gray-400 animate-spin" />
        </div>
      </div>

      <div>
        <h3 class="text-lg font-bold text-gray-900">
          {{ status === 'connecting' ? '正在建立加密通道...' : (status === 'receiving' ? '正在接收文件' : '接收完成') }}
        </h3>
        <p class="text-sm text-gray-500 h-5">{{ fileName || '等待元数据...' }}</p>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between text-xs text-gray-500 px-1">
          <span>{{ formatSize(receivedBytes) }}</span>
          <span>{{ formatSize(totalBytes) }}</span>
        </div>
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-green-500 transition-all duration-300" :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <div v-if="status === 'completed'" class="animate-fade-in pt-4">
        <button @click="downloadFile" class="btn-primary w-full bg-green-600 hover:bg-green-700">
          <SaveIcon class="w-5 h-5" /> 保存文件
        </button>
      </div>
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
        接收方同样需要直接公网连接。请<span class="font-bold text-gray-900">暂时关闭 VPN</span> 以确保 NAT 穿透成功。
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
import { Html5Qrcode } from 'html5-qrcode'
import jsyaml from 'js-yaml'
import { P2PTY } from '../utils/p2pty.js'
import { checkVPN } from '../utils/networkCheck.js'
import BaseModal from '../components/BaseModal.vue'
import { 
  Check as CheckIcon, Loader as LoaderIcon, QrCode as QrCodeIcon, Clipboard as ClipboardIcon,
  FileText as FileTextIcon, Camera as CameraIcon, Download as DownloadIcon, Save as SaveIcon,
  ShieldAlert as ShieldAlertIcon, Globe as GlobeIcon, ArrowRight as ArrowRightIcon
} from 'lucide-vue-next'

const router = useRouter()

// 状态
const currentStep = ref(1)
const showVpnModal = ref(false)
const selectedStun = ref({ name: '腾讯云 (推荐)', urls: 'stun:stun.qq.com:3478', desc: '国内极速' })
const activeInputMethod = ref('scan')
const isScanning = ref(false)
const inputString = ref('')
const yamlFileName = ref('')
const isConnecting = ref(false)
const errorMsg = ref('')

// IP 探测
const isInitializing = ref(false)
const publicIp = ref('')

// 传输
const status = ref('idle')
const fileName = ref('')
const totalBytes = ref(0)
const receivedBytes = ref(0)
const receivedChunks = []
let p2p = null
let html5QrCode = null
let tempPc = null 

const stunOptions = [
  { name: '腾讯云 (推荐)', urls: 'stun:stun.qq.com:3478', desc: '国内极速' },
  { name: '小米 (Xiaomi)', urls: 'stun:stun.miwifi.com:3478', desc: '稳定可靠' },
  { name: 'Cloudflare', urls: 'stun:stun.cloudflare.com:3478', desc: '全球加速' }
]

const inputMethods = [
  { id: 'scan', label: '扫码', icon: QrCodeIcon },
  { id: 'text', label: '粘贴', icon: ClipboardIcon },
  { id: 'file', label: 'YAML', icon: FileTextIcon }
]

const canConnect = computed(() => inputString.value && inputString.value.length > 20)
const progress = computed(() => totalBytes.value === 0 ? 0 : (receivedBytes.value / totalBytes.value) * 100)

// 方法
const closeVpnModal = () => showVpnModal.value = false
const goBackHome = () => router.push('/')
const goToInputStep = () => { if(publicIp.value) currentStep.value = 2 }

// 接收方特有的 IP 探测（因为还没 P2PTY 实例）
const detectPublicIp = async () => {
    isInitializing.value = true
    publicIp.value = ''
    try {
        tempPc = new RTCPeerConnection({ iceServers: [{ urls: selectedStun.value.urls }] })
        tempPc.createDataChannel('') // 触发 ICE
        
        tempPc.onicecandidate = (e) => {
            if (e.candidate && e.candidate.candidate) {
                const parts = e.candidate.candidate.split(' ')
                if (parts.length >= 8 && parts[7] === 'srflx') {
                    publicIp.value = parts[4]
                    isInitializing.value = false
                    tempPc.close()
                    tempPc = null
                }
            }
        }
        
        const offer = await tempPc.createOffer()
        await tempPc.setLocalDescription(offer)
    } catch (e) {
        alert('探测失败: ' + e.message)
        isInitializing.value = false
    }
}

// 扫码/YAML 逻辑
const startScanner = () => {
  isScanning.value = true
  html5QrCode = new Html5Qrcode("qr-reader")
  html5QrCode.start(
    { facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => { inputString.value = decodedText; stopScanner(); },
    () => {}
  ).catch(err => { isScanning.value = false; errorMsg.value = "摄像头启动失败: " + err })
}

const stopScanner = () => {
  if (html5QrCode && isScanning.value) {
    html5QrCode.stop().then(() => { html5QrCode.clear(); isScanning.value = false; }).catch(console.error)
  }
}

const yamlInput = ref(null)
const triggerYamlInput = () => yamlInput.value.click()
const handleYamlUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  yamlFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const config = jsyaml.load(ev.target.result)
      if (config && config.connection_string) inputString.value = config.connection_string
      else errorMsg.value = "无效 YAML"
    } catch (err) { errorMsg.value = "解析失败" }
  }
  reader.readAsText(file)
}

// 开始连接
const startConnection = async () => {
  if (!inputString.value) return
  receivedChunks.length = 0
  errorMsg.value = ''
  isConnecting.value = true
  status.value = 'connecting'
  
  try {
    p2p = new P2PTY({
      role: 'PEER',
      connectionString: inputString.value.trim(),
      iceServers: [{ urls: selectedStun.value.urls }]
    })

    p2p.on('onConnect', () => { status.value = 'receiving'; currentStep.value = 3 })
    p2p.on('onFileProgress', (loaded, total) => {
      receivedBytes.value = loaded
      totalBytes.value = total
      if (!fileName.value && p2p.transfer.fileMeta) fileName.value = p2p.transfer.fileMeta.name
    })
    p2p.on('onFileChunk', (chunk) => receivedChunks.push(chunk))
    p2p.on('onFileVerified', (success) => {
      if (success) status.value = 'completed'
      else errorMsg.value = '校验失败'
    })
    p2p.on('onError', (err) => {
      errorMsg.value = err.message
      isConnecting.value = false
      status.value = 'idle'
    })

    await p2p.start()
  } catch (e) {
    errorMsg.value = `初始化错误: ${e.message}`
    isConnecting.value = false
  }
}

const downloadFile = () => {
  if (receivedChunks.length === 0) return
  const blob = new Blob(receivedChunks)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.value || 'received_file'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
  setTimeout(async () => {
    const isVpn = await checkVPN()
    if (isVpn) showVpnModal.value = true
  }, 600)
})

onBeforeUnmount(() => {
  stopScanner()
  if (p2p) p2p.close()
  if (tempPc) tempPc.close()
})
</script>