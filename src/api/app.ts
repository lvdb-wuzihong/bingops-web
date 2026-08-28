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
  repo_url: string | null
  // 各环境流水线地址 {env: url}，key 对齐 env 标签值域
  pipelines: Record<string, string>
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
  repo_url?: string | null
  pipelines?: Record<string, string>
}

export interface IBusinessAppUpdate {
  name?: string
  team?: string
  owner?: string
  department?: string
  description?: string
  labels?: Record<string, string>
  repo_url?: string | null
  pipelines?: Record<string, string>
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

// ========== 应用-资源关联 ==========

export interface IAppResource {
  resource_id: number
  name: string
  provider: string
  model_code: string
  status: string
  // env 由后端从资源 env/k8s:env 标签实时解析，未打标签为 null
  env: string | null
  region: string | null
  // tag=标签自动归集 manual=手动绑定
  source: 'tag' | 'manual'
}

export interface IResourceApp {
  app_id: number
  app_code: string
  name: string
  source: 'tag' | 'manual'
}

export function getAppResources(appId: number, env?: string) {
  return request.get<IAppResource[]>(`/api/v1/cmdb/apps/${appId}/resources`, { params: { env } })
}

export function bindAppResource(appId: number, resourceId: number) {
  return request.post<null>(`/api/v1/cmdb/apps/${appId}/resources`, { resource_id: resourceId })
}

export function unbindAppResource(appId: number, resourceId: number) {
  return request.delete<null>(`/api/v1/cmdb/apps/${appId}/resources/${resourceId}`)
}

export function getResourceApps(resourceId: number) {
  return request.get<IResourceApp[]>(`/api/v1/cmdb/apps/by-resource/${resourceId}`)
}
