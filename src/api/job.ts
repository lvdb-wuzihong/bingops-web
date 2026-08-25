import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== Runbook ==========

export interface IRunbook {
  id: number
  name: string
  category: string | null
  description: string | null
  params_schema: Record<string, unknown>
  steps: Record<string, unknown>[]
  connection: Record<string, unknown>
  version: number
  risk_level: string
  auto_rollback: boolean
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface IRunbookCreate {
  name: string
  category?: string | null
  description?: string | null
  params_schema?: Record<string, unknown>
  steps: Record<string, unknown>[]
  connection?: Record<string, unknown>
  risk_level?: string
  auto_rollback?: boolean
}

export interface IRunbookUpdate {
  name?: string
  category?: string | null
  description?: string | null
  params_schema?: Record<string, unknown>
  steps?: Record<string, unknown>[]
  connection?: Record<string, unknown>
  risk_level?: string
  auto_rollback?: boolean
  is_active?: boolean
}

export interface IRunbookQuery extends IPageParams {
  keyword?: string
  category?: string
}

export function getRunbooks(params?: IRunbookQuery) {
  return request.get<IPaginatedData<IRunbook>>('/api/v1/jobs/runbooks', { params })
}

export function getRunbook(id: number) {
  return request.get<IRunbook>(`/api/v1/jobs/runbooks/${id}`)
}

export function createRunbook(data: IRunbookCreate) {
  return request.post<IRunbook>('/api/v1/jobs/runbooks', data)
}

export function updateRunbook(id: number, data: IRunbookUpdate) {
  return request.put<IRunbook>(`/api/v1/jobs/runbooks/${id}`, data)
}

export function deleteRunbook(id: number) {
  return request.delete<null>(`/api/v1/jobs/runbooks/${id}`)
}

// ========== 执行实例 ==========

export interface IExecutionTarget {
  resource_id: number
  name: string
  ip?: string | null
  region?: string | null
  model_code?: string | null
}

export interface IExecution {
  id: number
  runbook_id: number
  runbook_version: number
  code_ref: string
  params: Record<string, unknown>
  target_resources: IExecutionTarget[]
  connection: Record<string, unknown>
  status: string
  rollback_policy: string
  ticket_id: number | null
  triggered_by: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface IJobStep {
  id: number
  execution_id: number
  step_key: string
  step_name: string | null
  type: string
  attempt_type: string
  status: string
  serial: string | null
  exit_code: number | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export interface IExecutionDetail extends IExecution {
  steps: IJobStep[]
}

export interface IStepLog {
  id: number
  step_id: number
  seq: number
  level: string
  host: string | null
  line: string
  logged_at: string
}

export interface IExecutionCreate {
  runbook_id: number
  params?: Record<string, unknown>
  target_resource_ids: number[]
  code_ref: string
}

export interface IExecutionQuery extends IPageParams {
  status?: string
  runbook_id?: number
}

export function getExecutions(params?: IExecutionQuery) {
  return request.get<IPaginatedData<IExecution>>('/api/v1/jobs/executions', { params })
}

export function createExecution(data: IExecutionCreate) {
  return request.post<IExecution>('/api/v1/jobs/executions', data)
}

export function getExecution(id: number) {
  return request.get<IExecutionDetail>(`/api/v1/jobs/executions/${id}`)
}

export function cancelExecution(id: number) {
  return request.post<IExecution>(`/api/v1/jobs/executions/${id}/cancel`)
}

export function rollbackExecution(id: number) {
  return request.post<IExecution>(`/api/v1/jobs/executions/${id}/rollback`)
}

// after_seq 增量拉取，前端轮询 live tail
export function getStepLogs(stepId: number, afterSeq = 0) {
  return request.get<IStepLog[]>(`/api/v1/jobs/steps/${stepId}/logs`, { params: { after_seq: afterSeq } })
}

// ========== 状态展示 ==========

export const EXECUTION_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待执行', color: 'gold' },
  running: { text: '执行中', color: 'arcoblue' },
  success: { text: '成功', color: 'green' },
  failed: { text: '失败', color: 'red' },
  cancelled: { text: '已取消', color: 'gray' },
  rolling_back: { text: '回滚中', color: 'orange' },
  rolled_back: { text: '已回滚', color: 'purple' },
  partial_rollback: { text: '部分回滚', color: 'magenta' },
}

export function executionStatus(s: string) {
  return EXECUTION_STATUS_MAP[s] || { text: s, color: 'gray' }
}

export const RISK_LEVEL_MAP: Record<string, { text: string; color: string }> = {
  low: { text: '低风险', color: 'green' },
  medium: { text: '中风险', color: 'orange' },
  high: { text: '高风险', color: 'red' },
}

export function riskLevel(s: string) {
  return RISK_LEVEL_MAP[s] || { text: s, color: 'gray' }
}

// 执行/步骤的活跃态（需要轮询刷新）
export function isActiveStatus(s: string): boolean {
  return s === 'pending' || s === 'running' || s === 'rolling_back'
}
