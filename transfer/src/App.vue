<template>
  <div class="min-h-screen flex flex-col items-center pt-10 pb-10 px-4">
    <header class="mb-12 text-center animate-fade-in">
      <div 
        class="inline-flex items-center justify-center w-16 h-16 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg mb-4 cursor-pointer hover:scale-105 transition-transform"
        @click="goHome"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-apple-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M16 12l-4-4-4 4"/>
          <path d="M12 16V8"/>
        </svg>
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-gray-900">P2PTY Transfer</h1>
      <p class="text-gray-500 mt-2 text-sm font-medium">安全、极速的点对点加密传输</p>
    </header>

    <main class="w-full max-w-lg relative">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    
    <footer class="mt-auto pt-10 text-center text-gray-400 text-xs">
      <p>Powered by P2PTY.js Protocol & Vue 3</p>
      <p class="mt-1">花火·Sparklewink https://github.com/Sparklewink/p2pty</p>
    </footer>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
const goHome = () => {
  router.push('/')
}
</script>