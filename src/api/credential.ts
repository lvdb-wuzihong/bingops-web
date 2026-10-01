import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 凭据目录（v31：只存 Vault 引用与元数据，明文禁入） ==========

export type CredentialKind = 'ssh_key' | 'cloud_ak' | 'db_password' | 'api_token' | 'kubeconfig'

export const CREDENTIAL_KIND_MAP: Record<string, { text: string; color: string }> = {
  ssh_key: { text: 'SSH 密钥', color: 'arcoblue' },
  cloud_ak: { text: '云 AK', color: 'orange' },
  db_password: { text: '数据库密码', color: 'green' },
  api_token: { text: 'API Token', color: 'purple' },
  kubeconfig: { text: 'Kubeconfig', color: 'cyan' },
}

export function credentialKindText(k: string): string {
  return CREDENTIAL_KIND_MAP[k]?.text || k
}

// 探测状态由 runner 回填（bingops 不直连 Vault）
export const VERIFY_STATE_MAP: Record<string, { text: string; color: string }> = {
  ok: { text: '已验证', color: 'green' },
  failed: { text: '验证失败', color: 'red' },
  unknown: { text: '未验证', color: 'gray' },
}

export interface ICredential {
  id: number
  name: string
  kind: CredentialKind
  // v33：login_user 已删除——登录身份归主机标签 ssh_user，不属于钥匙材料
  vault_path: string
  vault_field: string | null
  cloud_account: string | null
  region: string | null
  is_default: boolean
  verify_state: string
  last_verified_at: string | null
  remark: string | null
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ICredentialCreate {
  name: string
  kind: CredentialKind
  vault_path: string
  vault_field?: string | null
  cloud_account?: string | null
  region?: string | null
  is_default?: boolean
  remark?: string | null
}

export interface ICredentialUpdate extends Partial<ICredentialCreate> {
  is_active?: boolean
}

export interface ICredentialQuery extends IPageParams {
  kind?: string
  keyword?: string
}

// 引用反查：换钥匙/删条目之前必看的影响面
export interface ICredentialUsage {
  credential_id: number
  credential_name: string
  host_tag_refs: number
  runbook_refs: number
  hosts: Record<string, unknown>[]
}

export function getCredentials(params?: ICredentialQuery) {
  return request.get<IPaginatedData<ICredential>>('/api/v1/credentials', { params })
}

export function createCredential(data: ICredentialCreate) {
  return request.post<ICredential>('/api/v1/credentials', data)
}

export function updateCredential(id: number, data: ICredentialUpdate) {
  return request.put<ICredential>(`/api/v1/credentials/${id}`, data)
}

export function deleteCredential(id: number) {
  return request.delete<null>(`/api/v1/credentials/${id}`)
}

export function getCredentialUsage(id: number) {
  return request.get<ICredentialUsage>(`/api/v1/credentials/${id}/usage`)
}
