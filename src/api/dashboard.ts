import request from '../utils/request'
import type { IResourceStats } from './cmdb'

// 获取仪表盘统计数据（复用 CMDB 资源统计）
export function getDashboardStats() {
  return request.get<IResourceStats>('/api/v1/cmdb/resources/stats')
}
