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

// ========== 告警规则（二期起为分发源：绑定数据源 + 评估契约字段） ==========

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
  // 绑定通知渠道；空 = 通知由执行器默认处理
  notify_channel_id: number | null
  // ── 二期：评估契约字段 ──
  // 绑定监控数据源；空 = 仅事件记录不开单的 webhook-only 规则
  source_id: number | null
  // 评估 SQL 契约：单行两列 error_count + log_details；含 {window_minutes} 占位
  eval_sql: string | null
  threshold: number
  interval_minutes: number
  // 连续 M 轮达标才报 firing（防抖）
  for_rounds: number
  detail_limit: number
  grafana_url: string | null
  feishu_card_template: Record<string, unknown> | null
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
  notify_channel_id?: number | null
  source_id?: number | null
  eval_sql?: string | null
  threshold?: number
  interval_minutes?: number
  for_rounds?: number
  detail_limit?: number
  grafana_url?: string | null
  feishu_card_template?: Record<string, unknown> | null
}

export interface IAlertRuleUpdate {
  name?: string | null
  group_id?: number | null
  stale_minutes?: number | null
  default_severity?: number | null
  static_labels?: Record<string, string> | null
  notify_enabled?: boolean | null
  enabled?: boolean | null
  notify_channel_id?: number | null
  source_id?: number | null
  eval_sql?: string | null
  threshold?: number | null
  interval_minutes?: number | null
  for_rounds?: number | null
  detail_limit?: number | null
  grafana_url?: string | null
  feishu_card_template?: Record<string, unknown> | null
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

// ========== 监控数据源（多套 CH/VM；凭据红线：只存 password_ref 引用名） ======

// clickhouse | victoria | prometheus
export type MonitoringSourceType = 'clickhouse' | 'victoria' | 'prometheus'

export interface IMonitoringSource {
  id: number
  name: string
  type: MonitoringSourceType
  host: string
  port: number
  database_name: string | null
  username: string | null
  // 凭据引用名（真凭据在执行器侧 env；平台不落密码）
  password_ref: string
  secure: boolean
  region: string | null
  vpc: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface IMonitoringSourceCreate {
  name: string
  type: MonitoringSourceType
  host: string
  port: number
  database_name?: string | null
  username?: string | null
  password_ref: string
  secure?: boolean
  region?: string | null
  vpc?: string | null
  enabled?: boolean
}

export interface IMonitoringSourceUpdate {
  host?: string
  port?: number
  database_name?: string | null
  username?: string | null
  password_ref?: string
  secure?: boolean
  region?: string | null
  vpc?: string | null
  enabled?: boolean
}

export function getMonitoringSources() {
  return request.get<IMonitoringSource[]>('/api/v1/monitoring-sources')
}

export function createMonitoringSource(data: IMonitoringSourceCreate) {
  return request.post<IMonitoringSource>('/api/v1/monitoring-sources', data)
}

export function updateMonitoringSource(id: number, data: IMonitoringSourceUpdate) {
  return request.put<IMonitoringSource>(`/api/v1/monitoring-sources/${id}`, data)
}

// 有启用规则绑定时后端阻断（避免孤儿规则）
export function deleteMonitoringSource(id: number) {
  return request.delete<null>(`/api/v1/monitoring-sources/${id}`)
}

// ========== 通知渠道（告警媒介登记；发送动作在执行器，平台只登记配置并随分发下发） ===

// feishu_webhook 预置；dingtalk | wecom 为扩展位
export type NotifyChannelType = 'feishu_webhook'

export interface INotifyChannel {
  id: number
  name: string
  type: NotifyChannelType
  // webhook URL 凭据引用名（URL 即 secret，平台不落真地址）
  secret_ref: string
  // 非敏感参数（@手机号列表等）
  extra: Record<string, unknown>
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface INotifyChannelCreate {
  name: string
  type: NotifyChannelType
  secret_ref: string
  extra?: Record<string, unknown>
  enabled?: boolean
}

export interface INotifyChannelUpdate {
  type?: NotifyChannelType | null
  secret_ref?: string
  extra?: Record<string, unknown> | null
  enabled?: boolean | null
}

export function getNotifyChannels() {
  return request.get<INotifyChannel[]>('/api/v1/notify-channels')
}

export function createNotifyChannel(data: INotifyChannelCreate) {
  return request.post<INotifyChannel>('/api/v1/notify-channels', data)
}

export function updateNotifyChannel(id: number, data: INotifyChannelUpdate) {
  return request.put<INotifyChannel>(`/api/v1/notify-channels/${id}`, data)
}

// 有规则绑定时后端阻断（避免规则通知悬空）
export function deleteNotifyChannel(id: number) {
  return request.delete<null>(`/api/v1/notify-channels/${id}`)
}
