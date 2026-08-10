import request from '../utils/request'
import type { IPaginatedData } from '../types/common'
import type { IUser, IUserCreate, IUserUpdate, IUserRoleAssign } from '../types/user'

// 查询用户列表
export function getUserList(params?: { page?: number; page_size?: number; keyword?: string }) {
  return request.get<IPaginatedData<IUser>>('/api/v1/users', { params })
}

// 获取用户详情
export function getUserDetail(userId: number) {
  return request.get<IUser>(`/api/v1/users/${userId}`)
}

// 创建用户
export function createUser(data: IUserCreate) {
  return request.post<IUser>('/api/v1/users', data)
}

// 更新用户
export function updateUser(userId: number, data: IUserUpdate) {
  return request.put<IUser>(`/api/v1/users/${userId}`, data)
}

// 删除用户
export function deleteUser(userId: number) {
  return request.delete<null>(`/api/v1/users/${userId}`)
}

// 为用户分配角色
export function assignUserRoles(userId: number, data: IUserRoleAssign) {
  return request.put<null>(`/api/v1/users/${userId}/roles`, data)
}
