import type { Router } from 'vue-router'
import { useUserStore } from '../stores/user'

const WHITE_LIST = ['/auth/login']

export function setupRouterGuard(router: Router) {
  router.beforeEach(async (to, _from, next) => {
    const userStore = useUserStore()

    // 已登录
    if (userStore.isLoggedIn) {
      // 访问登录页 -> 跳转首页
      if (to.path === '/auth/login') {
        next('/dashboard')
        return
      }

      // 首次进入或未加载用户信息 -> 拉取
      if (!userStore.currentUser) {
        try {
          await userStore.fetchUserInfo()
          next({ ...to, replace: true })
        } catch {
          next('/auth/login')
        }
        return
      }

      next()
      return
    }

    // 未登录 - 白名单放行
    if (WHITE_LIST.includes(to.path)) {
      next()
      return
    }

    // 未登录 - 跳转登录页
    next(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
  })
}
