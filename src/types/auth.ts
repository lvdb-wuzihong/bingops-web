// 登录请求
export interface ILoginRequest {
  username: string
  password: string
}

// 刷新 Token 请求
export interface IRefreshRequest {
  refresh_token: string
}

// 登录响应
export interface ILoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
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
}

// 修改密码请求
export interface IChangePasswordRequest {
  old_password: string
  new_password: string
}
