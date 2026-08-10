import request from '../utils/request'
import type { IPaginatedData, IPageParams } from '../types/common'

// ========== 标签定义 ==========
export interface ITagDefinition {
  id: number
  tag_key: string
  name: string
  description: string | null
  category: string | null
  value_type: string
  allowed_values: string[] | null
  editable: boolean
  created_at: string
}

export interface ITagDefinitionCreate {
  tag_key: string
  name: string
  description?: string
  category?: string
  value_type?: string
  allowed_values?: string[]
  editable?: boolean
}

export interface ITagDefinitionUpdate {
  name?: string
  description?: string
  category?: string
  value_type?: string
  allowed_values?: string[]
  editable?: boolean
}

export interface ITagDefinitionQuery extends IPageParams {
  category?: string
}

export function getTagDefinitions(params?: ITagDefinitionQuery) {
  return request.get<IPaginatedData<ITagDefinition>>('/api/v1/cmdb/tags', { params })
}

export function getTagDefinition(id: number) {
  return request.get<ITagDefinition>(`/api/v1/cmdb/tags/${id}`)
}

export function createTagDefinition(data: ITagDefinitionCreate) {
  return request.post<ITagDefinition>('/api/v1/cmdb/tags', data)
}

export function updateTagDefinition(id: number, data: ITagDefinitionUpdate) {
  return request.put<ITagDefinition>(`/api/v1/cmdb/tags/${id}`, data)
}

export function deleteTagDefinition(id: number) {
  return request.delete<null>(`/api/v1/cmdb/tags/${id}`)
}

// ========== 资源标签 ==========
export interface IResourceTag {
  id: number
  resource_id: number
  tag_key: string
  tag_value: string
  source: string
  created_at: string
}

export interface IResourceTagCreate {
  resource_id: number
  tag_key: string
  tag_value: string
  source?: string
}

export function getResourceTags(resourceId: number) {
  return request.get<IResourceTag[]>(`/api/v1/cmdb/tags/resources/${resourceId}`)
}

export function addResourceTag(data: IResourceTagCreate) {
  return request.post<IResourceTag>('/api/v1/cmdb/tags/resources', data)
}

export function removeResourceTag(resourceId: number, tagKey: string, source?: string) {
  return request.delete<null>(`/api/v1/cmdb/tags/resources/${resourceId}/${tagKey}`, { params: { source } })
}

// ========== 标签搜索 ==========
export function findResourcesByTag(tagKey: string, tagValue?: string) {
  return request.get<number[]>('/api/v1/cmdb/tags/search/by-tag', { params: { tag_key: tagKey, tag_value: tagValue } })
}
