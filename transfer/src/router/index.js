import { createRouter, createWebHistory } from 'vue-router'
// 暂时引入简单的占位组件，稍后我们会实现它们
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/sender',
      name: 'sender',
      // 路由懒加载
      component: () => import('../views/SenderView.vue')
    },
    {
      path: '/receiver',
      name: 'receiver',
      component: () => import('../views/ReceiverView.vue')
    }
  ]
})

export default router