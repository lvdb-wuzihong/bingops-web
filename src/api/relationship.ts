import request from '../utils/request'

// ========== 从属关系 (belongs-to) ==========

export interface IBelongsToCreate {
  child_id: number
  parent_id: number
  description?: string | null
}

export interface IBelongsToRelation {
  id: number
  child_id: number
  parent_id: number
  description: string | null
  synced_at: string | null
  source: string
  created_at: string
}

export function addBelongsTo(data: IBelongsToCreate) {
  return request.post<IBelongsToRelation>('/api/v1/cmdb/belongs-to', data)
}

export function removeBelongsTo(relationId: number) {
  return request.delete<null>(`/api/v1/cmdb/belongs-to/${relationId}`)
}

export function getChildren(resourceId: number, description?: string) {
  return request.get<IBelongsToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/children`, { params: { description } })
}

export function getParents(resourceId: number, description?: string) {
  return request.get<IBelongsToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/parents`, { params: { description } })
}

// ========== 关联关系 (relates-to) ==========

export interface IRelatesToCreate {
  source_id: number
  target_id: number
  description?: string | null
  attributes?: Record<string, unknown>
}

export interface IRelatesToRelation {
  id: number
  source_id: number
  target_id: number
  description: string | null
  attributes: Record<string, unknown>
  synced_at: string | null
  source: string
  created_at: string
}

export function addRelatesTo(data: IRelatesToCreate) {
  return request.post<IRelatesToRelation>('/api/v1/cmdb/relates-to', data)
}

export function removeRelatesTo(relationId: number) {
  return request.delete<null>(`/api/v1/cmdb/relates-to/${relationId}`)
}

export function getRelationsFrom(resourceId: number, description?: string) {
  return request.get<IRelatesToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/relations-from`, { params: { description } })
}

export function getRelationsTo(resourceId: number, description?: string) {
  return request.get<IRelatesToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/relations-to`, { params: { description } })
}
