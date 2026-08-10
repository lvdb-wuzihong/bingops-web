import request from '../utils/request'
import type { IPaginatedData } from '../types/common'

// 同步任务
export interface ISyncTask {
  id: number
  name: string
  task_type: string // k8s | cloud
  provider: string | null
  target_id: string
  resource_types: string[]
  schedule: string | null
  enabled: boolean
  description: string | null
  last_run_at?: string | null
  last_run_status?: string | null
  created_at: string
  updated_at: string
}

// 同步任务查询参数
export interface ISyncTaskQuery {
  task_type?: string
  enabled?: boolean
  keyword?: string
  page?: number
  page_size?: number
}

// 创建同步任务
export interface ISyncTaskCreate {
  name: string
  task_type: string
  provider?: string
  target_id: string
  resource_types?: string[]
  schedule?: string
  enabled?: boolean
  description?: string
}

// 更新同步任务
export interface ISyncTaskUpdate {
  name?: string
  provider?: string
  resource_types?: string[]
  schedule?: string
  enabled?: boolean
  description?: string
}

// 查询同步任务列表（分页）
export function getSyncTasks(params?: ISyncTaskQuery) {
  return request.get<IPaginatedData<ISyncTask>>('/api/v1/cmdb/sync-tasks', { params })
}

// 获取同步任务详情
export function getSyncTask(id: number) {
  return request.get<ISyncTask>(`/api/v1/cmdb/sync-tasks/${id}`)
}

// 创建同步任务
export function createSyncTask(data: ISyncTaskCreate) {
  return request.post<ISyncTask>('/api/v1/cmdb/sync-tasks', data)
}

// 更新同步任务
export function updateSyncTask(id: number, data: ISyncTaskUpdate) {
  return request.put<ISyncTask>(`/api/v1/cmdb/sync-tasks/${id}`, data)
}

// 删除同步任务
export function deleteSyncTask(id: number) {
  return request.delete<null>(`/api/v1/cmdb/sync-tasks/${id}`)
}

// 启用/禁用同步任务
export function toggleSyncTask(id: number, enabled: boolean) {
  return request.patch<ISyncTask>(`/api/v1/cmdb/sync-tasks/${id}/toggle`, { enabled })
}
