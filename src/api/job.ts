import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== Runbook ==========

// v29 扁平单步：一个 runbook = 一个步骤，steps 数组与 auto_rollback 已从契约删除，
// 步骤属性直接以列形式出现在响应体（exec_type/entry/run_on/timeout_sec/…）
export type ExecType = 'ansible' | 'shell' | 'python' | 'terraform'
export type RunOn = 'target' | 'local'

export interface IRunbook {
  id: number
  name: string
  category: string | null
  description: string | null
  params_schema: Record<string, unknown>
  // 需走 Vault 的入参声明 {变量名: {required, description, default_ref}}（v27 凭据三层分离）
  secrets_schema: Record<string, unknown>
  // ── 步骤列（v29，创建时缺省由后端按 exec_type 推断）──
  exec_type: ExecType
  // 语义随 exec_type 变：ansible=playbook 路径 / python=脚本 / terraform=目录；shell 恒为命令字符串
  entry: string
  run_on: RunOn
  timeout_sec: number
  // 默认 true，不可逆任务显式 false；回滚统一重跑同入口 + 注入 BINGOPS_ACTION=undo
  rollbackable: boolean
  // 仅存钥匙名（ssh_user/ssh_key_ref/become*），真钥匙在 Vault
  connection: Record<string, unknown>
  // 目标模型 code 白名单，空/null 时后端默认 [aliyun_ecs, gcp_compute]
  target_models: string[] | null
  // 执行未传时继承的默认目标与代码版本（v26）
  default_target_resource_ids: number[]
  default_code_ref: string | null
  version: number
  risk_level: string
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

// 创建/更新载荷：与响应同构但步骤属性可选（None → 后端推断）
export interface IRunbookCreate {
  name: string
  exec_type: ExecType
  entry: string
  category?: string | null
  description?: string | null
  params_schema?: Record<string, unknown>
  secrets_schema?: Record<string, unknown>
  run_on?: RunOn | null
  timeout_sec?: number | null
  rollbackable?: boolean
  connection?: Record<string, unknown>
  // 平铺糖字段，与 connection 共存时覆盖同名键
  ssh_user?: string | null
  ssh_key_ref?: string | null
  become?: boolean | null
  become_method?: string | null
  become_user?: string | null
  target_models?: string[] | null
  risk_level?: string
  default_target_resource_ids?: number[] | null
  default_code_ref?: string | null
}

export interface IRunbookUpdate extends Partial<IRunbookCreate> {
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
  // {变量名: Vault 钥匙名}，明文永不入库（v27）
  secrets: Record<string, unknown>
  // 无目标任务（run_on=local）时为空数组
  target_resources: IExecutionTarget[]
  connection: Record<string, unknown>
  status: string
  // v28 起恒为 manual（自动回滚已从契约删除），P2 解冻时复用此列
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
  // {变量名: Vault 钥匙名}；未传项由 secrets_schema 的 default_ref 回填
  secrets?: Record<string, unknown>
  // 未传→继承 runbook.default_target_resource_ids；显式传 [] 视为无目标（target 型 400）
  target_resource_ids?: number[] | null
  // 未传→runbook.default_code_ref→平台配置；全空后端 400
  code_ref?: string | null
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
  rollback_failed: { text: '回滚失败', color: 'red' },
}

export function executionStatus(s: string) {
  return EXECUTION_STATUS_MAP[s] || { text: s, color: 'gray' }
}

export const RISK_LEVEL_MAP: Record<string, { text: string; color: string }> = {
  low: { text: '低风险', color: 'green' },
  medium: { text: '中风险', color: 'orange' },
  high: { text: '高风险', color: 'red' },
  critical: { text: '极高风险', color: 'magenta' },
}

export function riskLevel(s: string) {
  return RISK_LEVEL_MAP[s] || { text: s, color: 'gray' }
}

// 执行/步骤的活跃态（需要轮询刷新）
export function isActiveStatus(s: string): boolean {
  return s === 'pending' || s === 'running' || s === 'rolling_back'
}

// exec_type 展示（terraform 门控未开，创建表单不可选但历史数据可能存在）
export const EXEC_TYPE_MAP: Record<string, { text: string; color: string }> = {
  ansible: { text: 'Ansible', color: 'purple' },
  shell: { text: 'Shell', color: 'gray' },
  python: { text: 'Python', color: 'green' },
  terraform: { text: 'Terraform', color: 'orangered' },
}

export function execTypeMeta(s: string) {
  return EXEC_TYPE_MAP[s] || { text: s, color: 'gray' }
}

// 当前开放的执行方式（terraform 仅注册类型占位，本轮拒绝创建）
export const CREATABLE_EXEC_TYPES: ExecType[] = ['ansible', 'shell', 'python']
