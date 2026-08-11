import request from '../utils/request'
import type { IPaginatedData } from '../types/common'

export interface IChangeLog {
  id: number
  resource_id: number
  model_id: number | null
  model_code: string | null
  // 模型名称（v2 由 model_id 解析，兼容 v1 契约字段名）
  resource_type: string
  change_type: string
  field: string | null
  old_value: string | null
  new_value: string | null
  source: string
  operator: string | null
  created_at: string
}

export interface IChangeLogQuery {
  resource_id?: number
  change_type?: string
  page?: number
  page_size?: number
}

export function getChangeLogs(params?: IChangeLogQuery) {
  return request.get<IPaginatedData<IChangeLog>>('/api/v1/cmdb/changes', { params })
}
