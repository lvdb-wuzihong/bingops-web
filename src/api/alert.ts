import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 告警事件（监控闭环层，契约见 docs/monitoring-design.md） ==========

export type AlertStatus = 'firing' | 'resolved' | 'error' | 'recorded'

// 告警类型：log（日志/事件型，流水不合并）| metric（指标/状态型，firing 合并续命）；由后端按绑定数据源 type 推导
export type AlertRuleKind = 'log' | 'metric'

// 告警级别：值域对齐夜莺（1/2/3），文案采用夜莺分级口径，规则页与事件页共用一份，
// text 用于表格/标签（短），full 用于表单选项（完整口径）
export const SEVERITY_MAP: Record<number, { text: string; full: string; color: string }> = {
  1: { text: '一级 Critical', full: '一级报警（Critical）', color: 'red' },
  2: { text: '二级 Warning', full: '二级报警（Warning）', color: 'orange' },
  3: { text: '三级 Info', full: '三级报警（Info）', color: 'arcoblue' },
}

// 处置结论（v29）：告警准确率的统计原料，准确率 = valid / 已标注总数；resolved 后可复盘补标，重复标注覆盖
export const VERDICT_MAP: Record<string, { text: string; color: string }> = {
  valid: { text: '有效', color: 'green' },
  false_positive: { text: '误报', color: 'gray' },
  duplicate: { text: '重复', color: 'purple' },
}

export interface IAlertEvent {
  id: number
  source: string
  rule_code: string
  rule_name: string | null
  status: AlertStatus
  // 后端按规则绑定数据源 type 推导定型；直报历史事件为 null
  rule_kind: AlertRuleKind | null
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
  // 数据源归属（取自规则绑定的数据源；直报事件为 null）
  monitoring_source_id: number | null
  // JSONB 黑盒，平台不解析内部结构
  details: unknown
  error: string | null
  // 首次 firing 自动开的工单
  ticket_id: number | null
  group_id: number | null
  // ── 认领与处置标注（v29）──
  // 认领人 users.id（仅活跃 firing 可认领；响应只给 id，姓名由前端映射）
  claimed_by: number | null
  // MTTA 起点（最早人工动作：有工单取工单首响，只有认领取此值）
  claimed_at: string | null
  // valid | false_positive | duplicate；未标注为 null
  verdict: string | null
  created_at: string
  updated_at: string
}

export interface IAlertEventQuery extends IPageParams {
  status?: string
  source?: string
  rule_code?: string
  rule_kind?: string
  since?: string
  until?: string
}

export function getAlertEvents(params?: IAlertEventQuery) {
  return request.get<IPaginatedData<IAlertEvent>>('/api/v1/alerts/events', { params })
}

// 单事件详情（飞书卡片「事件详情」按钮落地：{frontend_base_url}/alerts/events/{event_id}）
export function getAlertEvent(id: number) {
  return request.get<IAlertEvent>(`/api/v1/alerts/events/${id}`)
}

// ========== 认领与处置标注（v29，权限码 alert:claim） ==========

// 认领活跃 firing（本人重复认领幂等；他人已认领 409；非 firing 400）
export function claimAlertEvent(id: number) {
  return request.post<IAlertEvent>(`/api/v1/alerts/events/${id}/claim`)
}

// 放弃认领（未认领幂等；仅认领本人或超管可放）
export function releaseAlertEvent(id: number) {
  return request.post<IAlertEvent>(`/api/v1/alerts/events/${id}/release`)
}

// 标注处置结论（任意状态可标，重复标注覆盖）
export function setAlertEventVerdict(id: number, verdict: 'valid' | 'false_positive' | 'duplicate') {
  return request.post<IAlertEvent>(`/api/v1/alerts/events/${id}/verdict`, { verdict })
}

// ========== 统计 ==========

export interface IAlertStatsGroup {
  key: string
  firing_count: number
  resolved_count: number
  error_count: number
  // log 流水事件条数与错误总次数（仅 rule_kind=log 的事件产生）
  recorded_count: number
  recorded_error_total: number
}

export interface IAlertStatsSummary {
  group_by: string
  groups: IAlertStatsGroup[]
  active_firing_total: number
  // 平均恢复时长（resolved 事件 resolved_at - first_seen_at），秒；无 resolved 事件为 null
  avg_resolve_seconds: number | null
}

export function getAlertStats(params?: { group_by?: string; rule_kind?: string; since?: string; until?: string }) {
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
  // 查询窗口（分钟）：评估 SQL 里的 {window_minutes} 占位
  interval_minutes: number
  // 规则级扫描间隔（秒）：执行器按它调度本规则，与查询窗口独立
  eval_interval_seconds: number
  // 连续 M 轮达标才报 firing（防抖）
  for_rounds: number
  // 活跃指标告警的重复提醒间隔（分钟，v28 起规则级可配）；日志告警每轮直发不读本字段
  repeat_notify_minutes: number
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
  eval_interval_seconds?: number
  for_rounds?: number
  repeat_notify_minutes?: number
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
  eval_interval_seconds?: number | null
  for_rounds?: number | null
  repeat_notify_minutes?: number | null
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
  // victoria/prometheus 的完整查询地址（Grafana 数据源 URL 同款，不含 /api/v1/query 尾巴）；
  // clickhouse 不用；留空时平台/执行器按 host/port 拼接（租户前缀场景必须手填）
  url: string | null
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
  url?: string | null
  enabled?: boolean
}

export interface IMonitoringSourceUpdate {
  host?: string
  port?: number
  database_name?: string | null
  username?: string | null
  password_ref?: string
  secure?: boolean
  url?: string | null
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

// ========== 告警屏蔽规则（v27：时间窗内命中的事件照落库，仅抑制通知） ==========

export interface IAlertMute {
  id: number
  name: string
  // 精确匹配规则 code；null = 屏蔽全部规则
  rule_code: string | null
  // 事件 labels 匹配器（事件 labels 须包含全部键值对）；空 = 不过滤标签
  labels: Record<string, string>
  starts_at: string
  ends_at: string
  note: string | null
  enabled: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface IAlertMuteCreate {
  name: string
  rule_code?: string | null
  labels?: Record<string, string>
  starts_at: string
  ends_at: string
  note?: string | null
  enabled?: boolean
}

// 部分更新；时间窗单端提供时后端与旧值合并后再校验 ends_at>starts_at
export type IAlertMuteUpdate = Partial<IAlertMuteCreate>

// 列表含已过期条目（便于回看历史），无分页
export function getAlertMutes() {
  return request.get<IAlertMute[]>('/api/v1/alerts/mutes')
}

export function createAlertMute(data: IAlertMuteCreate) {
  return request.post<IAlertMute>('/api/v1/alerts/mutes', data)
}

export function updateAlertMute(id: number, data: IAlertMuteUpdate) {
  return request.put<IAlertMute>(`/api/v1/alerts/mutes/${id}`, data)
}

export function deleteAlertMute(id: number) {
  return request.delete<null>(`/api/v1/alerts/mutes/${id}`)
}
