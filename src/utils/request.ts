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
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse<IApiResponse>) => {
    const { data } = response
    if (data.code !== 0) {
      Message.error(data.message || '请求失败')
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return response
  },
  async (error) => {
    const status = error.response?.status
    const originalRequest = error.config

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
}

export default request
