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
  // 归属业务域（应用之上的唯一分组，v24）；未挂为 null
  business_id: number | null
  // 依赖声明：[{type: internal, app_code} / {type: external, name, url}]
  dependencies: Array<{ type: string; app_code?: string; name?: string; url?: string; note?: string }>
  created_at: string
  updated_at: string
}

export interface IAppDependency {
  type: string
  app_code?: string
  name?: string
  url?: string
  note?: string
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
  business_id?: number | null
  // 依赖声明：[{type: internal, app_code} / {type: external, name, url}]；整体提交，[] 即清空
  dependencies?: IAppDependency[]
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
  business_id?: number | null
  // 依赖声明：整体提交，[] 即清空
  dependencies?: IAppDependency[]
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
  // NULL = 无生命周期状态
  status: string | null
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

// ========== 应用拓扑（v24：以应用为中心的依赖/资源子图，G6 数据源） ==========

export type AppTopologyNodeType = 'app' | 'external' | 'resource'
export type AppTopologyRelation =
  | 'depends_on'
  | 'depended_by'
  | 'external_dependency'
  | 'hosts_resource'
  | 'shared_resource'

export interface IAppTopologyNode {
  // 带前缀字符串（app:{id} / external:{key} / resource:{rid}）
  id: string
  type: AppTopologyNodeType
  name: string
  // app 节点
  app_code?: string
  owner?: string | null
  business_id?: number | null
  is_center?: boolean
  // external 节点
  url?: string
  // resource 节点
  model_code?: string | null
  layer?: string | null
  provider?: string | null
  env?: string | null
  // 被其他应用共享归集（存储级耦合信号）
  shared?: boolean
}

export interface IAppTopologyEdge {
  source: string
  target: string
  relation: AppTopologyRelation
  note?: string
}

export interface IAppTopologyData {
  center_id: string
  nodes: IAppTopologyNode[]
  edges: IAppTopologyEdge[]
}

// env 可选：按环境标签（env/k8s:env）过滤资源节点；不传 = 全部环境
export function getAppTopology(appId: number, env?: string) {
  return request.get<IAppTopologyData>(`/api/v1/cmdb/apps/${appId}/topology`, { params: { env } })
}

// ========== 业务域（应用之上的唯一分组，v24） ==========

export interface IBusinessDomain {
  id: number
  code: string
  name: string
  owner: string | null
  description: string | null
  app_count: number
}

export interface IBusinessDomainCreate {
  name: string
  code: string
  owner?: string | null
  description?: string | null
}

export interface IBusinessDomainUpdate {
  name?: string
  owner?: string | null
  description?: string | null
}

export function listBusinessDomains() {
  return request.get<IBusinessDomain[]>('/api/v1/cmdb/business-domains')
}

export function createBusinessDomain(data: IBusinessDomainCreate) {
  return request.post<IBusinessDomain>('/api/v1/cmdb/business-domains', data)
}

export function updateBusinessDomain(id: number, data: IBusinessDomainUpdate) {
  return request.put<IBusinessDomain>(`/api/v1/cmdb/business-domains/${id}`, data)
}
