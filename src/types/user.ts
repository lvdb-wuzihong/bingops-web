
// 用户信息
export interface IUser {
  id: number
  username: string
  email: string
  display_name: string | null
  is_active: boolean
  is_superuser: boolean
  roles: string[]
  created_at: string
  updated_at: string
}

// 创建用户
export interface IUserCreate {
  username: string
  email: string
  password: string
  display_name?: string
  is_superuser?: boolean
}

// 更新用户
export interface IUserUpdate {
  email?: string
  display_name?: string
  is_active?: boolean
  is_superuser?: boolean
}

// 分配角色
export interface IUserRoleAssign {
  role_codes: string[]
}

// 用户列表查询参数
export interface IUserQuery {
  page?: number
  page_size?: number
  keyword?: string
}
