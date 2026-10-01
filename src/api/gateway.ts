import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 中转网关（v35：关联维度只留 VPC） ==========
// 网络拓扑事实，非任务属性。一个 VPC 只允许一条启用网关接管（重复后端 409 指名）。

export interface IJobGateway {
  id: number
  name: string
  host: string
  port: number
  login_user: string
  // 引用 credentials.name（kind=ssh_key）；空 = 网关用目标机同一把钥匙
  ssh_credential: string | null
  // 接管的 VPC（唯一关联维度）；非空、去重；值 = VPC 资源的 provider_id（如 vpc-2ze…）
  vpc_ids: string[]
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
  // 必填非空：留空该网关匹配不到任何机器（刻意无全局兜底）
  vpc_ids: string[]
  remark?: string | null
}

export interface IGatewayUpdate extends Partial<IGatewayCreate> {
  is_active?: boolean
}

export interface IGatewayQuery extends IPageParams {
  keyword?: string
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
