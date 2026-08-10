import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

export interface IBusinessApp {
  id: number
  app_code: string
  name: string
  team: string | null
  owner: string | null
  department: string | null
  description: string | null
  labels: Record<string, string> | null
  created_at: string
  updated_at: string
}

export interface IBusinessAppCreate {
  app_code: string
  name: string
  team?: string
  owner?: string
  department?: string
  description?: string
  labels?: Record<string, string>
}

export interface IBusinessAppUpdate {
  name?: string
  team?: string
  owner?: string
  department?: string
  description?: string
  labels?: Record<string, string>
}

export interface IBusinessAppQuery extends IPageParams {
  team?: string
  owner?: string
  keyword?: string
}

export function getApps(params?: IBusinessAppQuery) {
  return request.get<IPaginatedData<IBusinessApp>>('/api/v1/cmdb/apps', { params })
}

export function getApp(id: number) {
  return request.get<IBusinessApp>(`/api/v1/cmdb/apps/${id}`)
}

export function createApp(data: IBusinessAppCreate) {
  return request.post<IBusinessApp>('/api/v1/cmdb/apps', data)
}

export function updateApp(id: number, data: IBusinessAppUpdate) {
  return request.put<IBusinessApp>(`/api/v1/cmdb/apps/${id}`, data)
}

export function deleteApp(id: number) {
  return request.delete<null>(`/api/v1/cmdb/apps/${id}`)
}
