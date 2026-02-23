import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'board',
      component: () => import('../views/BoardView.vue')
    },
    {
      path: '/runs/:id',
      name: 'run-detail',
      component: () => import('../views/RunDetailView.vue'),
      props: true
    }
  ]
})
