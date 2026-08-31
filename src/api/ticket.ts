import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 工单类型 ==========

export interface ITicket {
  id: number
  ticket_no: string
  title: string
  description: string | null
  ticket_type: string
  status: string
  priority: string
  creator_id: number
  creator_name: string | null
  assignee_id: number | null
  assignee_name: string | null
  // 已废弃：兼容保留，存量数据已回填进 target_resource_ids
  related_resource_id: number | null
  // 执行目标资源 ID 列表（多选唯一入口）
  target_resource_ids: number[]
  runbook_id: number | null
  job_params: Record<string, unknown>
  code_ref: string | null
  // none|pending|approved|rejected
  approval_status: string | null
  catalog_item_id: number | null
  catalog_item_name: string | null
  catalog_category_name: string | null
  group_id: number | null
  group_name: string | null
  difficulty: string | null
  started_at: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface ITicketComment {
  id: number
  ticket_id: number
  user_id: number
  user_name: string | null
  action: string
  content: string | null
  from_value: string | null
  to_value: string | null
  created_at: string
}

export interface ITicketDetail extends ITicket {
  comments: ITicketComment[]
  approvals: IApproval[]
  job_execution: IJobExecutionSummary | null
}

export interface IApproval {
  id: number
  ticket_id: number
  approver_id: number
  approver_name: string | null
  action: string
  comment: string | null
  created_at: string
}

export interface IJobExecutionSummary {
  id: number
  runbook_id: number
  status: string
  started_at: string | null
  finished_at: string | null
}

export interface IFreeze {
  id: number
  name: string
  reason: string | null
  scope: string[] | null
  starts_at: string
  ends_at: string
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface IFreezeCreate {
  name: string
  reason?: string | null
  scope?: string[] | null
  starts_at: string
  ends_at: string
}

export interface IChangeContextResource {
  resource_id: number
  name: string | null
  model_code: string | null
  status: string | null
  env: string | null
  recent_changes: Record<string, unknown>[]
  busy_execution_id: number | null
  // 影响该资源的活跃工单（pending_approval/open/in_progress）
  active_tickets: { id: number; ticket_no: string; status: string; title: string }[]
  active_freezes: { id: number; name: string; reason: string | null; starts_at: string; ends_at: string }[]
}

export interface ITicketQuery extends IPageParams {
  status?: string
  ticket_type?: string
  priority?: string
  creator_id?: number
  assignee_id?: number
  group_id?: number
  catalog_item_id?: number
  // JSONB @> 包含语义过滤
  target_resource_id?: number
  keyword?: string
}

export interface ITicketCreate {
  title: string
  description?: string | null
  ticket_type?: string
  priority?: string
  assignee_id?: number | null
  // 已废弃：改用 target_resource_ids
  related_resource_id?: number | null
  target_resource_ids?: number[]
  catalog_item_id?: number | null
  group_id?: number | null
  runbook_id?: number | null
  job_params?: Record<string, unknown>
  code_ref?: string | null
}

export interface ITicketUpdate {
  title?: string | null
  description?: string | null
  priority?: string | null
}

// ========== 工单 CRUD ==========

export function getTickets(params?: ITicketQuery) {
  return request.get<IPaginatedData<ITicket>>('/api/v1/tickets', { params })
}

export function getTicket(id: number) {
  return request.get<ITicketDetail>(`/api/v1/tickets/${id}`)
}

export function createTicket(data: ITicketCreate) {
  return request.post<ITicket>('/api/v1/tickets', data)
}

export function updateTicket(id: number, data: ITicketUpdate) {
  return request.put<ITicket>(`/api/v1/tickets/${id}`, data)
}

export function deleteTicket(id: number) {
  return request.delete<null>(`/api/v1/tickets/${id}`)
}

// ========== 流转操作 ==========

export function assignTicket(id: number, assigneeId: number) {
  return request.post<ITicket>(`/api/v1/tickets/${id}/assign`, { assignee_id: assigneeId })
}

export function changeTicketStatus(id: number, status: string, comment?: string | null) {
  return request.post<ITicket>(`/api/v1/tickets/${id}/status`, { status, comment: comment || null })
}

export function getTicketComments(id: number) {
  return request.get<ITicketComment[]>(`/api/v1/tickets/${id}/comments`)
}

export function addTicketComment(id: number, content: string) {
  return request.post<ITicketComment>(`/api/v1/tickets/${id}/comments`, { content })
}

// ========== 审批 ==========

export function approveTicket(id: number, action: 'approve' | 'reject', comment?: string | null) {
  return request.post<ITicket>(`/api/v1/tickets/${id}/approve`, { action, comment: comment || null })
}

// ========== 运维下发 ==========

export interface IDispatchRequest {
  // git tag，必填
  code_ref: string
  // 执行参数，按 runbook params_schema 校验
  params?: Record<string, unknown>
}

// 运维角色（job:create）事后补齐执行配置并下发；提单人不接触
export function dispatchTicket(id: number, data: IDispatchRequest) {
  return request.post<ITicket>(`/api/v1/tickets/${id}/dispatch`, data)
}

// ========== 变更封禁窗口 ==========

export function getFreezes(activeOnly = false) {
  return request.get<IFreeze[]>('/api/v1/tickets/freezes', { params: { active_only: activeOnly } })
}

export function createFreeze(data: IFreezeCreate) {
  return request.post<IFreeze>('/api/v1/tickets/freezes', data)
}

export function deleteFreeze(id: number) {
  return request.delete<null>(`/api/v1/tickets/freezes/${id}`)
}

// ========== 变更上下文 ==========

export function getChangeContext(resourceIds: number[]) {
  return request.get<IChangeContextResource[]>('/api/v1/tickets/change-context', { params: { resource_ids: resourceIds.join(',') } })
}

// ========== 统计报表 ==========

export interface ITicketStatsQuery {
  date_from?: string
  date_to?: string
  group_id?: number
}

export interface IAssigneeStat {
  user_id: number
  name: string | null
  assigned: number
  done: number
  avg_response_minutes: number | null
  avg_handle_minutes: number | null
}

export interface ITicketStats {
  // 状态分布 + total
  totals: Record<string, number>
  // 全局时效：响应=started-created；处理=resolved-started（分钟）
  time: { avg_response_minutes: number | null; avg_handle_minutes: number | null }
  by_assignee: IAssigneeStat[]
  by_category: { category: string; total: number }[]
  trend: { date: string; created: number; resolved: number }[]
}

export function getTicketStats(params?: ITicketStatsQuery) {
  return request.get<ITicketStats>('/api/v1/tickets/stats', { params })
}
