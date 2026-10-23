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
  // v18：建单挂靠业务应用作上下文
  business_app_id: number | null
  business_app_name: string | null
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
  // v38：详情响应已内嵌附件数组，无需再单独拉列表
  attachments: ITicketAttachment[]
}

// ========== 工单附件（v38：OSS 私有桶，平台代理下载） ==========

export interface ITicketAttachment {
  id: number
  ticket_id: number
  filename: string
  size: number
  content_type: string | null
  uploaded_by: number
  uploader_name: string | null
  // 平台代理下载地址（不暴露 OSS 签名 URL）
  download_url: string
  created_at: string
}

// 扩展名白名单与单文件上限对齐后端 ticket_attachment_service.ALLOWED_EXTENSIONS /
// BINGOPS_TICKET_ATTACHMENT_MAX_MB 默认值；后端仍会二次校验（放宽时以 422 消息为准）
export const ATTACHMENT_ALLOWED_EXT = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
  'txt', 'log', 'json', 'csv', 'md', 'yaml', 'yml', 'sql',
  'pdf', 'zip', 'gz', 'tgz', 'tar',
] as const
export const ATTACHMENT_MAX_MB = 20
export const ATTACHMENT_ACCEPT = ATTACHMENT_ALLOWED_EXT.map(e => `.${e}`).join(',')

// 可增删附件的工单状态（终态只读，后端同样限制）
export const ATTACHMENT_EDITABLE_STATUSES = ['open', 'pending_approval', 'in_progress']

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
  business_app_id?: number | null
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

// ========== 附件（v38） ==========

// 附件列表（详情响应已内嵌 attachments，此接口用于单独刷新）
export function getTicketAttachments(ticketId: number) {
  return request.get<ITicketAttachment[]>(`/api/v1/tickets/${ticketId}/attachments`)
}

// 上传：multipart/form-data，字段名固定为 file（不要手动设 Content-Type，交给浏览器带边界）
export function uploadTicketAttachment(ticketId: number, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<ITicketAttachment>(`/api/v1/tickets/${ticketId}/attachments`, fd)
}

export function deleteTicketAttachment(ticketId: number, attachmentId: number) {
  return request.delete<null>(`/api/v1/tickets/${ticketId}/attachments/${attachmentId}`)
}

// 下载：平台代理端点需 Authorization 头，不能用 <a href> 直链（会 401），必须以 blob 取回后本地保存
// 附件对象上的 download_url 即该端点地址
export function downloadTicketAttachment(downloadUrl: string) {
  return request.download(downloadUrl)
}

// ========== 审批 ==========

export function approveTicket(id: number, action: 'approve' | 'reject', comment?: string | null) {
  return request.post<ITicket>(`/api/v1/tickets/${id}/approve`, { action, comment: comment || null })
}

// ========== 运维下发 ==========

export interface IDispatchRequest {
  // v20：runbook 由运维下发时选择（同一事项可对应多个 runbook）
  runbook_id: number
  // git tag，必填
  code_ref: string
  // 执行参数，按 runbook params_schema 校验（default 后端回填）
  params?: Record<string, unknown>
  // 执行目标：本次传入优先，否则用工单已有目标，皆空拒绝
  target_resource_ids?: number[]
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
