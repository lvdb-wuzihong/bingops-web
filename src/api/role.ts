import request from '../utils/request'
import type { IRole, IRoleCreate, IRoleUpdate, IRolePermissionAssign, IPermission } from '../types/role'

// 查询角色列表
export function getRoleList() {
  return request.get<IRole[]>('/api/v1/roles')
}

// 获取角色详情
export function getRoleDetail(roleId: number) {
  return request.get<IRole>(`/api/v1/roles/${roleId}`)
}

// 创建角色
export function createRole(data: IRoleCreate) {
  return request.post<IRole>('/api/v1/roles', data)
}

// 更新角色
export function updateRole(roleId: number, data: IRoleUpdate) {
  return request.put<IRole>(`/api/v1/roles/${roleId}`, data)
}

// 删除角色
export function deleteRole(roleId: number) {
  return request.delete<null>(`/api/v1/roles/${roleId}`)
}

// 为角色分配权限
export function assignRolePermissions(roleId: number, data: IRolePermissionAssign) {
  return request.put<null>(`/api/v1/roles/${roleId}/permissions`, data)
}

// 查询所有权限清单
export function getAllPermissions() {
  return request.get<IPermission[]>('/api/v1/roles/permissions/all')
}
