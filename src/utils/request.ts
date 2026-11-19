import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { Message } from '@arco-design/web-vue'
import type { IApiResponse } from '../types/common'
import type { IRefreshRequest } from '../types/auth'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 是否正在刷新 Token
let isRefreshing = false
// 等待刷新完成的请求队列
let refreshSubscribers: Array<(token: string) => void> = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

// 请求拦截器
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    // 显式传入的 Authorization（如 MFA 绑定 setup_ticket）优先，不被本地 access_token 覆盖
    if (token && !config.headers.has('Authorization')) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // FormData（附件上传等）：必须去掉默认的 application/json，否则 axios 1.x 的
    // transformRequest 会把 FormData 序列化成 JSON；移除后浏览器自动带 multipart 边界
    if (config.data instanceof FormData) {
      config.headers.delete('Content-Type')
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器

// 认证/MFA 端点自身的错误不走刷新流程：
// 登录页与绑定页无 refresh_token 时旧逻辑会触发 handleLogout 整页刷新，把错误提示吞掉
const AUTH_ENDPOINTS = [
  '/api/v1/auth/login', // 含 /auth/login/mfa
  '/api/v1/auth/refresh',
  '/api/v1/auth/feishu/callback',
  '/api/v1/auth/mfa/', // setup / enable / disable：绑定用 setup_ticket 鉴权，不能触发 token 刷新
]

// 认证端点这些状态码一律透传后端原因（400/422 含验证码错误，423/429 含锁定限流）
const AUTH_PASSTHROUGH_STATUS = [400, 401, 403, 410, 422, 423, 429]

function isAuthEndpoint(config?: InternalAxiosRequestConfig): boolean {
  return AUTH_ENDPOINTS.some((u) => config?.url?.includes(u) ?? false)
}

// 后端认证错误消息为英文，透传前转中文
const AUTH_ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/invalid username or password/i, '用户名或密码错误'],
  [/account is disabled/i, '账号已被禁用'],
  [/user not found/i, '用户不存在或已禁用'],
  [/invalid or expired refresh token/i, '登录已过期，请重新登录'],
  [/invalid.*(otp|verification code)|incorrect.*(otp|code)|(otp|code).*invalid/i, '动态验证码错误，请重试'],
  [/(ticket|setup).*(expired|invalid)|(expired|invalid).*(ticket|setup|otp)/i, '验证已过期，请返回重新登录'],
  [/lock(ed)?|too many (failed )?attempts/i, '尝试次数过多，账号已被临时锁定'],
]

function translateAuthMessage(raw: string): string {
  const hit = AUTH_ERROR_MESSAGES.find(([re]) => re.test(raw))
  return hit ? hit[1] : raw
}

function authErrorMessage(error: { response?: { data?: { message?: string } } }): string {
  const raw = error.response?.data?.message || ''
  return translateAuthMessage(raw) || '登录失败'
}

service.interceptors.response.use(
  (response: AxiosResponse<IApiResponse>) => {
    const { data } = response
    // 二进制响应（附件下载等 responseType=blob）不走统一信封校验：Blob 上没有 code 字段
    if (data instanceof Blob || data instanceof ArrayBuffer) return response
    if (data.code !== 0) {
      // 认证/MFA 端点的信封级错误（HTTP 200 + code 非 0）同样透传中文映射
      const message = isAuthEndpoint(response.config)
        ? translateAuthMessage(data.message || '')
        : data.message || '请求失败'
      Message.error(message || '请求失败')
      return Promise.reject(new Error(message || '请求失败'))
    }
    return response
  },
  async (error) => {
    const status = error.response?.status
    const originalRequest = error.config

    // 认证/MFA 端点：透传后端原因（不进刷新流程，防止登录页整页刷新吞掉提示）
    if (status && AUTH_PASSTHROUGH_STATUS.includes(status) && isAuthEndpoint(originalRequest)) {
      Message.error(authErrorMessage(error))
      return Promise.reject(error)
    }

    // 401 自动刷新 Token
    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(service(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        handleLogout()
        return Promise.reject(error)
      }

      try {
        const res = await axios.post(`${service.defaults.baseURL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        } as IRefreshRequest)

        const { access_token, refresh_token: newRefreshToken } = res.data.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', newRefreshToken)
        isRefreshing = false
        onRefreshed(access_token)

        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return service(originalRequest)
      } catch {
        isRefreshing = false
        handleLogout()
        return Promise.reject(error)
      }
    }

    const messages: Record<number, string> = {
      401: '登录已过期，请重新登录',
      403: '拒绝访问',
      404: '请求资源不存在',
      500: '服务器错误',
      502: '网关错误',
      503: '服务不可用',
    }
    Message.error(messages[status] || error.message || '网络异常')
    return Promise.reject(error)
  }
)

function handleLogout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  // 保留退出前完整路径，重新登录后回跳；登录页自身发起的请求 401 不再拼 redirect（防死循环）
  const { pathname, search, hash } = window.location
  if (pathname.startsWith('/auth/login')) {
    window.location.href = '/auth/login'
    return
  }
  const redirect = encodeURIComponent(pathname + search + hash)
  window.location.href = `/auth/login?redirect=${redirect}`
}

// 封装请求方法
const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<IApiResponse<T>> {
    return service.get(url, config).then((res) => res.data)
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IApiResponse<T>> {
    return service.post(url, data, config).then((res) => res.data)
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IApiResponse<T>> {
    return service.put(url, data, config).then((res) => res.data)
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IApiResponse<T>> {
    return service.patch(url, data, config).then((res) => res.data)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<IApiResponse<T>> {
    return service.delete(url, config).then((res) => res.data)
  },
  // 二进制下载（附件等）：后端直接返回字节流，不包统一信封
  async download(url: string, config?: AxiosRequestConfig): Promise<Blob> {
    const res = await service.get(url, { ...config, responseType: 'blob' })
    return res.data as Blob
  },
}

export default request
