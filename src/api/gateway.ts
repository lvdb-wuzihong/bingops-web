import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 中转网关（v32：网络拓扑事实，非任务属性） ==========

// scope 多维匹配：命中任一即服务；空 scope 不匹配任何机器（无全局兜底）
export interface IGatewayScope {
  vpc_ids: string[]
  cloud_accounts: string[]
  regions: string[]
  resource_ids: number[]
}

export interface IJobGateway {
  id: number
  name: string
  host: string
  port: number
  login_user: string
  // 引用 credentials.name（kind=ssh_key）；空 = 网关用目标机同一把钥匙
  ssh_credential: string | null
  scope: Partial<IGatewayScope>
  priority: number
  remark: string | null
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface IGatewayCreate {
  name: string
  host: string
  port?: number
  login_user?: string
  ssh_credential?: string | null
  scope?: Partial<IGatewayScope>
  priority?: number
  remark?: string | null
}

export interface IGatewayUpdate extends Partial<IGatewayCreate> {
  is_active?: boolean
}

export interface IGatewayQuery extends IPageParams {
  keyword?: string
}

// 主机可达性视图的一行
export interface IHostReachability {
  resource_id: number
  name: string
  ip: string | null
  model_code: string | null
  cloud_account: string | null
  region: string | null
  vpc_id: string | null
  credential: string | null
  credential_ok: boolean
  // 走哪个网关；null 且 gateway_ok=true 表示直连
  gateway: string | null
  gateway_ok: boolean
  // 缺口原因，后端已给文本，前端不再推断
  missing: string[]
}

export function getGateways(params?: IGatewayQuery) {
  return request.get<IPaginatedData<IJobGateway>>('/api/v1/job-gateways', { params })
}

export function createGateway(data: IGatewayCreate) {
  return request.post<IJobGateway>('/api/v1/job-gateways', data)
}

export function updateGateway(id: number, data: IGatewayUpdate) {
  return request.put<IJobGateway>(`/api/v1/job-gateways/${id}`, data)
}

export function deleteGateway(id: number) {
  return request.delete<null>(`/api/v1/job-gateways/${id}`)
}

// 静态可达总览：凭据齐不齐、走哪条路、缺什么（无网关=直连，不算缺口）
export function getReachability(params?: { model_code?: string[]; limit?: number }) {
  return request.get<IHostReachability[]>('/api/v1/job-gateways/reachability', { params })
}
