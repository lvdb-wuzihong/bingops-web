import request from '../utils/request'
import type { IPaginatedData } from '../types/common'

// CMDB 资源通用类型（v2 动态模型驱动）
export interface ICmdbResource {
  id: number
  model_id: number
  provider: string | null
  provider_id: string | null
  cloud_account: string | null
  name: string
  region: string | null
  zone: string | null
  // NULL = 该资源类型无生命周期状态；unknown = 有状态概念但识别失败
  status: string | null
  fields: Record<string, unknown>
  resource_version: string | null
  synced_at: string | null
  source: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  // joined from model table (optional)
  model_name?: string
  model_code?: string
}

// 资源查询参数
export interface IResourceQuery {
  model_id?: number
  provider?: string
  status?: string
  cloud_account?: string
  region?: string
  keyword?: string
  page?: number
  page_size?: number
}

// 资源创建
export interface IResourceCreate {
  model_id: number
  name: string
  provider?: string
  provider_id?: string
  cloud_account?: string
  region?: string
  zone?: string
  status?: string
  fields?: Record<string, unknown>
}

// 资源更新
export interface IResourceUpdate {
  name?: string
  status?: string
  region?: string
  zone?: string
  fields?: Record<string, unknown>
}

// 资源统计
export interface IResourceStats {
  by_model: Record<string, number>
  by_status: Record<string, number>
  by_provider: Record<string, number>
  total: number
}

// 获取资源列表
export function getResourceList(params?: IResourceQuery) {
  return request.get<IPaginatedData<ICmdbResource>>('/api/v1/cmdb/resources', { params })
}

// 资源选择器轻量搜索（下拉/首页全局搜索；keyword 覆盖 name/IP/labels/fields）
export interface IResourceOption {
  id: number
  name: string
  model_code: string | null
  provider: string | null
  region: string | null
  // NULL = 该资源类型无生命周期状态；unknown = 有状态概念但识别失败
  status: string | null
  // 实例 ID（IP/主机标识等，搜索结果摘要展示用）
  provider_id: string | null
  labels: Record<string, string> | null
}

export function getResourceOptions(params?: { keyword?: string; model_id?: number; status?: string; limit?: number }) {
  return request.get<IResourceOption[]>('/api/v1/cmdb/resources/options', { params })
}

// 获取资源详情
export function getResourceDetail(id: number) {
  return request.get<ICmdbResource>(`/api/v1/cmdb/resources/${id}`)
}

// 创建资源
export function createResource(data: IResourceCreate) {
  return request.post<ICmdbResource>('/api/v1/cmdb/resources', data)
}

// 更新资源
export function updateResource(id: number, data: IResourceUpdate) {
  return request.put<ICmdbResource>(`/api/v1/cmdb/resources/${id}`, data)
}

// 删除资源（软删除）
export function deleteResource(id: number) {
  return request.delete<null>(`/api/v1/cmdb/resources/${id}`)
}

// 获取资源统计
export function getResourceStats() {
  return request.get<IResourceStats>('/api/v1/cmdb/resources/stats')
}

// ========== 全局搜索（工作台搜索页，跨应用/资源分组聚合） ==========

export interface ISearchApp {
  id: number
  app_code: string
  name: string
  owner: string | null
  team: string | null
}

export interface ISearchResource {
  id: number
  name: string
  model_id: number
  model_code: string | null
  provider: string | null
  region: string | null
  status: string | null
}

export interface IGlobalSearchResult {
  apps: ISearchApp[]
  resources: ISearchResource[]
}

// q 覆盖名称/实例 ID；资源侧动态字段值（IP/连接地址等）恒参与匹配；exact=true 为等值
export function globalSearch(params: { q: string; exact?: boolean; limit?: number }) {
  return request.get<IGlobalSearchResult>('/api/v1/cmdb/search', { params })
}

// ========== 我的关注（资源收藏） ==========

export interface IFavoriteItem {
  // 资源 ID
  id: number
  name: string
  model_id: number
  model_code: string | null
  provider: string | null
  region: string | null
  status: string | null
  favorited_at: string | null
}

export function listFavorites() {
  return request.get<IFavoriteItem[]>('/api/v1/cmdb/resources/favorites')
}

// 收藏（幂等）
export function addFavorite(resourceId: number) {
  return request.put<null>(`/api/v1/cmdb/resources/${resourceId}/favorite`)
}

export function removeFavorite(resourceId: number) {
  return request.delete<null>(`/api/v1/cmdb/resources/${resourceId}/favorite`)
}

// ========== 资产总览聚合（分类→模型→存活资源数，单请求渲染整页） ==========

export interface IModelOverviewItem {
  id: number
  code: string
  name: string
  icon: string | null
  description: string | null
  is_enabled: boolean
  // 架构分层：access/service/middleware/storage/host/network/infra；未设置为 null
  layer: string | null
  resource_count: number
}

export interface IModelOverviewCategory {
  id: number
  code: string
  name: string
  icon: string | null
  models: IModelOverviewItem[]
}

export function getModelsOverview() {
  return request.get<IModelOverviewCategory[]>('/api/v1/cmdb/models/overview')
}
