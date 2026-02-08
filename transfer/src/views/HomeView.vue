<template>
    <div class="glass-card p-8 animate-slide-up">
      <h2 class="text-xl font-semibold text-center mb-8 text-gray-800">请选择您的身份</h2>
      
      <div class="space-y-4">
        <button 
          @click="selectRole('sender')"
          class="group w-full p-6 rounded-2xl bg-white/50 border border-white/60 hover:bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-500 transition-colors duration-300">
              <UploadIcon class="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <div class="text-left">
              <h3 class="font-semibold text-gray-900">我是发送方</h3>
              <p class="text-sm text-gray-500">创建连接并发送文件</p>
            </div>
          </div>
          <ChevronRightIcon class="w-5 h-5 text-gray-300 group-hover:text-gray-500" />
        </button>
  
        <button 
          @click="selectRole('receiver')"
          class="group w-full p-6 rounded-2xl bg-white/50 border border-white/60 hover:bg-white/80 transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-500 transition-colors duration-300">
              <DownloadIcon class="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
            </div>
            <div class="text-left">
              <h3 class="font-semibold text-gray-900">我是接收方</h3>
              <p class="text-sm text-gray-500">加入连接并接收文件</p>
            </div>
          </div>
          <ChevronRightIcon class="w-5 h-5 text-gray-300 group-hover:text-gray-500" />
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  import { useRouter } from 'vue-router'
  import { Upload as UploadIcon, Download as DownloadIcon, ChevronRight as ChevronRightIcon } from 'lucide-vue-next'
  
  const router = useRouter()
  
  const selectRole = (role) => {
    router.push(`/${role}`)
  }
  </script>