// 登录请求
export interface ILoginRequest {
  username: string
  password: string
}

// 刷新 Token 请求
export interface IRefreshRequest {
  refresh_token: string
}

// Token 响应（账密登录 / 动态验证码登录 / 绑定完成 / 飞书回调 / 刷新成功）
export interface ITokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// 登录响应三态：后端按分支只填充对应字段
// 1) 直接成功（ITokenResponse 字段齐全）
// 2) 需要动态验证码：mfa_required + mfa_ticket，调 /auth/login/mfa 换 token
// 3) 需要先绑定动态验证码：mfa_setup_required + setup_ticket，跳 /mfa/bind
export interface ILoginResponse extends Partial<ITokenResponse> {
  // 账密校验已通过，需输入 6 位动态验证码
  mfa_required?: boolean
  mfa_ticket?: string
  // 强制 MFA 策略下首次登录：先完成绑定（setup_ticket 仅 5 分钟有效）
  mfa_setup_required?: boolean
  setup_ticket?: string
}

// 登录第二步：动态验证码校验
export interface ILoginMfaRequest {
  mfa_ticket: string
  otp_code: string
}

// MFA 绑定材料（secret 等同绑定凭据，禁止打印到控制台/日志）
export interface IMfaSetupResponse {
  otpauth_uri: string
  secret: string
}

// MFA 绑定启用请求
export interface IMfaEnableRequest {
  otp_code: string
}

// 当前用户信息
export interface ICurrentUser {
  id: number
  username: string
  email: string
  display_name: string | null
  is_active: boolean
  is_superuser: boolean
  // 角色 code 列表（后端契约 v16 后为字符串数组）
  roles: string[]
  permissions: string[]
  // 是否已设置本地密码；飞书 SSO 开户用户为 false，首次改密免验旧密码
  has_password: boolean
}

// 修改密码请求（飞书 SSO 开户用户首次设置时 old_password 不传）
export interface IChangePasswordRequest {
  old_password: string | null
  new_password: string
}
