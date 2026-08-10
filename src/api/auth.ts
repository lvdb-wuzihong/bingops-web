import request from '../utils/request'
import type { ILoginRequest, ILoginResponse, ICurrentUser, IChangePasswordRequest } from '../types/auth'

// 本地登录
export function login(data: ILoginRequest) {
  return request.post<ILoginResponse>('/api/v1/auth/login', data)
}

// 刷新 Token
export function refreshToken(refresh_token: string) {
  return request.post<ILoginResponse>('/api/v1/auth/refresh', { refresh_token })
}

// 登出
export function logout() {
  return request.post<null>('/api/v1/auth/logout')
}

// 获取当前用户信息
export function getCurrentUser() {
  return request.get<ICurrentUser>('/api/v1/auth/me')
}

// 修改密码
export function changePassword(data: IChangePasswordRequest) {
  return request.post<null>('/api/v1/auth/change-password', data)
}

// 获取飞书授权页 URL
export function getFeishuLoginUrl() {
  return request.get<{ url: string }>('/api/v1/auth/feishu/login')
}

// 飞书 SSO 回调
export function feishuCallback(code: string) {
  return request.get<ILoginResponse>('/api/v1/auth/feishu/callback', { params: { code } })
}
