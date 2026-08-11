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
  related_resource_id: number | null
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
}

export interface ITicketQuery extends IPageParams {
  status?: string
  ticket_type?: string
  priority?: string
  creator_id?: number
  assignee_id?: number
  keyword?: string
}

export interface ITicketCreate {
  title: string
  description?: string | null
  ticket_type?: string
  priority?: string
  assignee_id?: number | null
  related_resource_id?: number | null
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
