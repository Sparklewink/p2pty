<template>
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div class="absolute inset-0 bg-black/20 backdrop-blur-sm" @click="closeOnMask"></div>
        
        <div class="glass-card w-full max-w-sm p-6 relative z-10 animate-scale-up text-center">
          <div class="mb-4 flex justify-center">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <slot name="icon">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </slot>
            </div>
          </div>
          
          <h3 class="text-lg font-semibold text-gray-900 mb-2">
            <slot name="title">提示</slot>
          </h3>
          
          <p class="text-sm text-gray-500 mb-6 leading-relaxed">
            <slot name="content"></slot>
          </p>
          
          <div class="flex gap-3">
            <slot name="footer">
              <button @click="emit('close')" class="flex-1 btn-secondary text-sm py-2.5">取消</button>
              <button @click="emit('confirm')" class="flex-1 btn-primary text-sm py-2.5">确认</button>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </template>
  
  <script setup>
  const props = defineProps({
    show: Boolean,
    maskClosable: {
      type: Boolean,
      default: true
    }
  })
  
  const emit = defineEmits(['close', 'confirm'])
  
  const closeOnMask = () => {
    if (props.maskClosable) emit('close')
  }
  </script>
  
  <style scoped>
  .modal-enter-active,
  .modal-leave-active {
    transition: opacity 0.3s ease;
  }
  .modal-enter-from,
  .modal-leave-to {
    opacity: 0;
  }
  
  .animate-scale-up {
    animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  
  @keyframes scaleUp {
    0% { transform: scale(0.95); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  </style>