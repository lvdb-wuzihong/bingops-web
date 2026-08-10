import request from '../utils/request'

// ========== 从属关系 (belongs-to) ==========

export interface IBelongsToCreate {
  child_id: number
  parent_id: number
  relation_type: string
}

export interface IBelongsToRelation {
  id: number
  child_id: number
  parent_id: number
  relation_type: string
  child_name?: string
  parent_name?: string
  created_at: string
}

export function addBelongsTo(data: IBelongsToCreate) {
  return request.post<IBelongsToRelation>('/api/v1/cmdb/belongs-to', data)
}

export function removeBelongsTo(relationId: number) {
  return request.delete<null>(`/api/v1/cmdb/belongs-to/${relationId}`)
}

export function getChildren(resourceId: number, relationType?: string) {
  return request.get<IBelongsToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/children`, { params: { relation_type: relationType } })
}

export function getParents(resourceId: number, relationType?: string) {
  return request.get<IBelongsToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/parents`, { params: { relation_type: relationType } })
}

// ========== 关联关系 (relates-to) ==========

export interface IRelatesToCreate {
  source_id: number
  target_id: number
  relation_type: string
}

export interface IRelatesToRelation {
  id: number
  source_id: number
  target_id: number
  relation_type: string
  target_name?: string
  source_name?: string
  created_at: string
}

export function addRelatesTo(data: IRelatesToCreate) {
  return request.post<IRelatesToRelation>('/api/v1/cmdb/relates-to', data)
}

export function removeRelatesTo(relationId: number) {
  return request.delete<null>(`/api/v1/cmdb/relates-to/${relationId}`)
}

export function getRelationsFrom(resourceId: number, relationType?: string) {
  return request.get<IRelatesToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/relations-from`, { params: { relation_type: relationType } })
}

export function getRelationsTo(resourceId: number, relationType?: string) {
  return request.get<IRelatesToRelation[]>(`/api/v1/cmdb/resources/${resourceId}/relations-to`, { params: { relation_type: relationType } })
}
