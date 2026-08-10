import request from '../utils/request'
import type {
  IModelCategory, IModelCategoryCreate, IModelCategoryUpdate,
  IModel, IModelCreate, IModelUpdate,
  IModelField, IModelFieldCreate, IModelFieldUpdate,
  IModelRelation, IModelRelationCreate,
} from '../types/model'

// ========== 模型分类 ==========
export function getModelCategories() {
  return request.get<IModelCategory[]>('/api/v1/cmdb/models/categories')
}

export function createModelCategory(data: IModelCategoryCreate) {
  return request.post<IModelCategory>('/api/v1/cmdb/models/categories', data)
}

export function updateModelCategory(id: number, data: IModelCategoryUpdate) {
  return request.put<IModelCategory>(`/api/v1/cmdb/models/categories/${id}`, data)
}

export function deleteModelCategory(id: number) {
  return request.delete<null>(`/api/v1/cmdb/models/categories/${id}`)
}

// ========== 模型定义 ==========
export function getModels(categoryId?: number) {
  return request.get<IModel[]>('/api/v1/cmdb/models', { params: { category_id: categoryId } })
}

export function getModelDetail(id: number) {
  return request.get<IModel>(`/api/v1/cmdb/models/${id}`)
}

export function createModel(data: IModelCreate) {
  return request.post<IModel>('/api/v1/cmdb/models', data)
}

export function updateModel(id: number, data: IModelUpdate) {
  return request.put<IModel>(`/api/v1/cmdb/models/${id}`, data)
}

export function deleteModel(id: number) {
  return request.delete<null>(`/api/v1/cmdb/models/${id}`)
}

// ========== 字段定义 ==========
export function getModelFields(modelId: number) {
  return request.get<IModelField[]>(`/api/v1/cmdb/models/${modelId}/fields`)
}

export function createModelField(modelId: number, data: IModelFieldCreate) {
  return request.post<IModelField>(`/api/v1/cmdb/models/${modelId}/fields`, data)
}

export function updateModelField(modelId: number, fieldId: number, data: IModelFieldUpdate) {
  return request.put<IModelField>(`/api/v1/cmdb/models/${modelId}/fields/${fieldId}`, data)
}

export function deleteModelField(modelId: number, fieldId: number) {
  return request.delete<null>(`/api/v1/cmdb/models/${modelId}/fields/${fieldId}`)
}

// ========== 模型关系定义 ==========
export function getModelRelations(modelId: number) {
  return request.get<IModelRelation[]>(`/api/v1/cmdb/models/${modelId}/relations`)
}

export function createModelRelation(modelId: number, data: IModelRelationCreate) {
  return request.post<IModelRelation>(`/api/v1/cmdb/models/${modelId}/relations`, data)
}

export function deleteModelRelation(modelId: number, relationId: number) {
  return request.delete<null>(`/api/v1/cmdb/models/${modelId}/relations/${relationId}`)
}
