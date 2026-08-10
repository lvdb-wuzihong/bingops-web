import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ICurrentUser } from '../types/auth'
import * as authApi from '../api/auth'

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

  async function login(username: string, password: string) {
    const res = await authApi.login({ username, password })
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
    logout,
    fetchUserInfo,
    hasPermission,
  }
})
