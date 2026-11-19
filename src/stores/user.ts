import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ICurrentUser, ILoginResponse, ITokenResponse } from '../types/auth'
import * as authApi from '../api/auth'

// 登录结果三态：直接成功 / 需要动态验证码 / 需要先绑定动态验证码
export type LoginOutcome =
  | { status: 'success' }
  | { status: 'mfa_required'; mfaTicket: string }
  | { status: 'mfa_setup_required'; setupTicket: string }

function isTokenResponse(data: ILoginResponse): data is ITokenResponse {
  return !!data.access_token
}

export const useUserStore = defineStore('user', () => {
  const accessToken = ref(localStorage.getItem('access_token') || '')
  const refreshTokenVal = ref(localStorage.getItem('refresh_token') || '')
  const currentUser = ref<ICurrentUser | null>(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!accessToken.value)
  const permissions = computed(() => currentUser.value?.permissions || [])
  const roles = computed(() => currentUser.value?.roles || [])

  function setTokens(access: string, refresh: string) {
    accessToken.value = access
    refreshTokenVal.value = refresh
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
  }

  function clearTokens() {
    accessToken.value = ''
    refreshTokenVal.value = ''
    currentUser.value = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  async function login(username: string, password: string): Promise<LoginOutcome> {
    const res = await authApi.login({ username, password })
    const data = res.data
    if (isTokenResponse(data)) {
      setTokens(data.access_token, data.refresh_token)
      await fetchUserInfo()
      return { status: 'success' }
    }
    if (data.mfa_required && data.mfa_ticket) {
      return { status: 'mfa_required', mfaTicket: data.mfa_ticket }
    }
    if (data.mfa_setup_required && data.setup_ticket) {
      return { status: 'mfa_setup_required', setupTicket: data.setup_ticket }
    }
    throw new Error('登录响应异常，请联系管理员')
  }

  // 登录第二步：动态验证码换 token
  async function loginMfa(mfaTicket: string, otpCode: string) {
    const res = await authApi.loginMfa({ mfa_ticket: mfaTicket, otp_code: otpCode })
    setTokens(res.data.access_token, res.data.refresh_token)
    await fetchUserInfo()
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      clearTokens()
    }
  }

  async function fetchUserInfo() {
    if (!accessToken.value) return
    loading.value = true
    try {
      const res = await authApi.getCurrentUser()
      currentUser.value = res.data
    } catch {
      clearTokens()
    } finally {
      loading.value = false
    }
  }

  function hasPermission(code: string): boolean {
    return permissions.value.includes(code)
  }

  return {
    accessToken,
    currentUser,
    loading,
    isLoggedIn,
    permissions,
    roles,
    setTokens,
    clearTokens,
    login,
    loginMfa,
    logout,
    fetchUserInfo,
    hasPermission,
  }
})
