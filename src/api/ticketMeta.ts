import request from '../utils/request'

// ========== 服务目录（两级） ==========

export interface ICatalogItem {
  id: number
  name: string
  parent_id: number | null
  description: string | null
  // simple|medium|hard
  difficulty: string
  // low|medium|high
  default_risk: string
  default_type: string
  default_runbook_id: number | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ICatalogCreate {
  name: string
  parent_id?: number | null
  description?: string | null
  difficulty?: string
  default_risk?: string
  default_type?: string
  default_runbook_id?: number | null
  sort_order?: number
}

export interface ICatalogUpdate {
  description?: string | null
  difficulty?: string | null
  default_risk?: string | null
  default_type?: string | null
  default_runbook_id?: number | null
  is_active?: boolean | null
  sort_order?: number | null
}

export function getCatalog(params?: { parent_id?: number; include_inactive?: boolean }) {
  return request.get<ICatalogItem[]>('/api/v1/ticket-catalog', { params })
}

export function createCatalogItem(data: ICatalogCreate) {
  return request.post<ICatalogItem>('/api/v1/ticket-catalog', data)
}

export function updateCatalogItem(id: number, data: ICatalogUpdate) {
  return request.put<ICatalogItem>(`/api/v1/ticket-catalog/${id}`, data)
}

export function deleteCatalogItem(id: number) {
  return request.delete<null>(`/api/v1/ticket-catalog/${id}`)
}

// ========== 处理组 ==========

export interface ITicketGroup {
  id: number
  name: string
  description: string | null
  members: number[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface IGroupCreate {
  name: string
  description?: string | null
  members?: number[]
}

export interface IGroupUpdate {
  description?: string | null
  members?: number[] | null
  is_active?: boolean | null
}

export function getGroups(params?: { include_inactive?: boolean }) {
  return request.get<ITicketGroup[]>('/api/v1/ticket-groups', { params })
}

export function createGroup(data: IGroupCreate) {
  return request.post<ITicketGroup>('/api/v1/ticket-groups', data)
}

export function updateGroup(id: number, data: IGroupUpdate) {
  return request.put<ITicketGroup>(`/api/v1/ticket-groups/${id}`, data)
}

export function deleteGroup(id: number) {
  return request.delete<null>(`/api/v1/ticket-groups/${id}`)
}

// ========== 值班表 ==========

export interface IOncallSchedule {
  id: number
  group_id: number
  group_name: string | null
  oncall_date: string
  tier1: number[]
  tier2: number[]
  tier3: number[]
  note: string | null
  created_at: string
  updated_at: string
}

export interface IOncallCreate {
  group_id: number
  oncall_date: string
  tier1?: number[]
  tier2?: number[]
  tier3?: number[]
  note?: string | null
}

export interface IOncallUpdate {
  tier1?: number[] | null
  tier2?: number[] | null
  tier3?: number[] | null
  note?: string | null
}

export function getOncallSchedules(params?: { group_id?: number; date_from?: string; date_to?: string }) {
  return request.get<IOncallSchedule[]>('/api/v1/oncall-schedules', { params })
}

export function createOncallSchedule(data: IOncallCreate) {
  return request.post<IOncallSchedule>('/api/v1/oncall-schedules', data)
}

export function updateOncallSchedule(id: number, data: IOncallUpdate) {
  return request.put<IOncallSchedule>(`/api/v1/oncall-schedules/${id}`, data)
}

export function deleteOncallSchedule(id: number) {
  return request.delete<null>(`/api/v1/oncall-schedules/${id}`)
}

// ========== 字典 ==========

export const DIFFICULTY_MAP: Record<string, { text: string; color: string }> = {
  simple: { text: '简单', color: 'green' },
  medium: { text: '中等', color: 'orange' },
  hard: { text: '困难', color: 'red' },
}
