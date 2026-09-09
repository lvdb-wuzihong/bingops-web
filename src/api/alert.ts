import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 告警事件（监控闭环层，契约见 docs/monitoring-design.md） ==========

export type AlertStatus = 'firing' | 'resolved' | 'error'

export interface IAlertEvent {
  id: number
  source: string
  rule_code: string
  rule_name: string | null
  status: AlertStatus
  window_start: string | null
  window_end: string | null
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  // resolved_event=来源直传恢复 | stale_timeout=超时推导恢复
  resolve_reason: string | null
  total_count: number
  // 对齐夜莺值域：1=严重 2=中等 3=轻微
  severity: number
  labels: Record<string, string>
  // CMDB 尽力匹配的资源 ID
  resource_ids: number[]
  // JSONB 黑盒，平台不解析内部结构
  details: unknown
  error: string | null
  // 首次 firing 自动开的工单
  ticket_id: number | null
  group_id: number | null
  created_at: string
  updated_at: string
}

export interface IAlertEventQuery extends IPageParams {
  status?: string
  source?: string
  rule_code?: string
  since?: string
  until?: string
}

export function getAlertEvents(params?: IAlertEventQuery) {
  return request.get<IPaginatedData<IAlertEvent>>('/api/v1/alerts/events', { params })
}

// ========== 统计 ==========

export interface IAlertStatsGroup {
  key: string
  firing_count: number
  resolved_count: number
  error_count: number
}

export interface IAlertStatsSummary {
  group_by: string
  groups: IAlertStatsGroup[]
  active_firing_total: number
  // 平均恢复时长（resolved 事件 resolved_at - first_seen_at），秒；无 resolved 事件为 null
  avg_resolve_seconds: number | null
}

export function getAlertStats(params?: { group_by?: string; since?: string; until?: string }) {
  return request.get<IAlertStatsSummary>('/api/v1/alerts/stats/summary', { params })
}

// ========== 规则映射（rule_code → 处理组 / stale 窗口 / 开单开关） ==========

export interface IAlertRule {
  id: number
  source: string
  code: string
  name: string | null
  group_id: number | null
  stale_minutes: number
  default_severity: number
  static_labels: Record<string, string>
  notify_enabled: boolean
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface IAlertRuleCreate {
  source: string
  code: string
  name?: string | null
  group_id?: number | null
  stale_minutes?: number
  default_severity?: number
  static_labels?: Record<string, string>
  notify_enabled?: boolean
  enabled?: boolean
}

export interface IAlertRuleUpdate {
  name?: string | null
  group_id?: number | null
  stale_minutes?: number | null
  default_severity?: number | null
  static_labels?: Record<string, string> | null
  notify_enabled?: boolean | null
  enabled?: boolean | null
}

export function getAlertRules() {
  return request.get<IAlertRule[]>('/api/v1/alerts/rules')
}

export function createAlertRule(data: IAlertRuleCreate) {
  return request.post<IAlertRule>('/api/v1/alerts/rules', data)
}

export function updateAlertRule(id: number, data: IAlertRuleUpdate) {
  return request.put<IAlertRule>(`/api/v1/alerts/rules/${id}`, data)
}

export function deleteAlertRule(id: number) {
  return request.delete<null>(`/api/v1/alerts/rules/${id}`)
}
