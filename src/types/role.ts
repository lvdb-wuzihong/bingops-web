// 角色信息
export interface IRole {
  id: number
  code: string
  name: string
  description: string | null
  permissions: string[]
  created_at: string
  updated_at: string
}

// 创建角色
export interface IRoleCreate {
  code: string
  name: string
  description?: string
}

// 更新角色
export interface IRoleUpdate {
  name?: string
  description?: string
}

// 分配权限
export interface IRolePermissionAssign {
  permission_codes: string[]
}

// 权限信息
export interface IPermission {
  code: string
  name: string
  module: string
}
