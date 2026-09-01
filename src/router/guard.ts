import type { Router } from 'vue-router'
import { useUserStore } from '../stores/user'

const WHITE_LIST = ['/auth/login']

export function setupRouterGuard(router: Router) {
  router.beforeEach(async (to, _from, next) => {
    const userStore = useUserStore()

    // 已登录
    if (userStore.isLoggedIn) {
      // 访问登录页 -> 回跳 redirect（与登录页 safeRedirect 同规则）或首页
      if (to.path === '/auth/login') {
        const redirect = to.query.redirect
        if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
          next(redirect)
        } else {
          next('/dashboard')
        }
        return
      }

      // 首次进入或未加载用户信息 -> 拉取
      if (!userStore.currentUser) {
        try {
          await userStore.fetchUserInfo()
          next({ ...to, replace: true })
        } catch {
          // 用户信息拉取失败（token 已在 store 中清理），同样保留回跳路径
          next(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
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
