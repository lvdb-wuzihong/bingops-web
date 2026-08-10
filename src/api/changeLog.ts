import request from '../utils/request'
import type { IPaginatedData } from '../types/common'

export interface IChangeLog {
  id: number
  resource_id: number
  resource_name: string | null
  change_type: string
  field_name: string | null
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
