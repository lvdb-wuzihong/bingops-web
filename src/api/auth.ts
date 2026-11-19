import request from '../utils/request'
import type {
  ILoginRequest,
  ILoginResponse,
  ILoginMfaRequest,
  ITokenResponse,
  IMfaSetupResponse,
  IMfaEnableRequest,
  ICurrentUser,
  IChangePasswordRequest,
} from '../types/auth'

// 本地登录（响应三态：直接成功 / 需要动态验证码 / 需要先绑定动态验证码）
export function login(data: ILoginRequest) {
  return request.post<ILoginResponse>('/api/v1/auth/login', data)
}

// 登录第二步：动态验证码校验，成功后直接换发 token
export function loginMfa(data: ILoginMfaRequest) {
  return request.post<ITokenResponse>('/api/v1/auth/login/mfa', data)
}

// 刷新 Token
export function refreshToken(refresh_token: string) {
  return request.post<ITokenResponse>('/api/v1/auth/refresh', { refresh_token })
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

// 获取飞书授权页 URL（后端返回 { authorize_url }，redirect_uri 由后端配置指向 /auth/feishu/callback）
export function getFeishuLoginUrl() {
  return request.get<{ authorize_url: string }>('/api/v1/auth/feishu/login')
}

// 飞书 SSO 回调
export function feishuCallback(code: string) {
  return request.get<ILoginResponse>('/api/v1/auth/feishu/callback', { params: { code } })
}

// ========== MFA 绑定（均挂在 /api/v1/auth 前缀下，与登录同一 router） ==========
// 初始化绑定：登录态外传 setup_ticket（Authorization: Bearer <ticket>），
// 已登录主动绑定不传，拦截器自动注入本地 access token；返回的 secret 等同绑定凭据
// 显式 headers 优先于本地 access_token（见 utils/request.ts 请求拦截器）
export function mfaSetup(setupTicket?: string) {
  return request.post<IMfaSetupResponse>(
    '/api/v1/auth/mfa/setup',
    undefined,
    setupTicket ? { headers: { Authorization: `Bearer ${setupTicket}` } } : undefined
  )
}

// 启用绑定：校验首个动态验证码；setup 流程成功响应直接含 token，登录闭环无需再登
export function mfaEnable(data: IMfaEnableRequest, setupTicket?: string) {
  return request.post<ILoginResponse>(
    '/api/v1/auth/mfa/enable',
    data,
    setupTicket ? { headers: { Authorization: `Bearer ${setupTicket}` } } : undefined
  )
}

// 解绑动态验证码（已登录，走 access token）
export function mfaDisable() {
  return request.post<null>('/api/v1/auth/mfa/disable')
}
