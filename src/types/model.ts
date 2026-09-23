// ========== CMDB 动态模型类型定义 ==========

// 枚举选项
export interface IOptionItem {
  label: string
  value: string
  color?: string
}

// ---------- 模型分类 ----------
export interface IModelCategory {
  id: number
  name: string
  code: string
  icon: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IModelCategoryCreate {
  name: string
  code: string
  icon?: string
  sort_order?: number
}

export interface IModelCategoryUpdate {
  name?: string
  icon?: string | null
  sort_order?: number | null
}

// ---------- 模型定义 ----------

// 模型架构分层（资产分层，与后端 ModelCreate.layer 值域对齐）
export const MODEL_LAYERS = ['access', 'service', 'middleware', 'storage', 'host', 'network', 'infra'] as const

export const MODEL_LAYER_MAP: Record<string, { text: string; color: string }> = {
  access: { text: '接入层', color: 'cyan' },
  service: { text: '服务层', color: 'arcoblue' },
  middleware: { text: '中间件层', color: 'purple' },
  storage: { text: '存储层', color: 'green' },
  host: { text: '主机层', color: 'orange' },
  network: { text: '网络层', color: 'blue' },
  infra: { text: '基础设施层', color: 'gray' },
}

export interface IModel {
  id: number
  category_id: number
  name: string
  code: string
  icon: string | null
  description: string | null
  is_builtin: boolean
  is_enabled: boolean
  // 架构分层：access/service/middleware/storage/host/network/infra；未设置为 null
  layer: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // 详情接口可能带
  fields?: IModelField[]
  relations?: IModelRelation[]
  category?: IModelCategory
}

export interface IModelCreate {
  category_id: number
  name: string
  code: string
  icon?: string
  description?: string
  layer?: string | null
  sort_order?: number
}

export interface IModelUpdate {
  name?: string
  icon?: string | null
  description?: string | null
  layer?: string | null
  is_enabled?: boolean | null
  sort_order?: number | null
}

// ---------- 字段定义 ----------
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'multi_enum' | 'password' | 'json'

export interface IModelField {
  id: number
  model_id: number
  name: string
  code: string
  field_type: FieldType
  group_name: string | null
  is_required: boolean
  is_unique: boolean
  is_searchable: boolean
  is_builtin: boolean
  default_value: string | null
  placeholder: string | null
  options: IOptionItem[] | null
  /** @deprecated 公共选项库引用已下线，枚举一律用内联 options */
  option_set_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IModelFieldCreate {
  name: string
  code: string
  field_type: FieldType
  group_name?: string | null
  is_required?: boolean
  is_unique?: boolean
  is_searchable?: boolean
  default_value?: string | null
  placeholder?: string | null
  options?: IOptionItem[] | null
  sort_order?: number
}

export interface IModelFieldUpdate {
  name?: string
  group_name?: string | null
  is_required?: boolean | null
  is_unique?: boolean | null
  is_searchable?: boolean | null
  default_value?: string | null
  placeholder?: string | null
  options?: IOptionItem[] | null
  sort_order?: number | null
}

// ---------- 模型关系定义 ----------
export interface IModelRelation {
  id: number
  source_model_id: number
  target_model_id: number
  source_model_code?: string | null
  source_model_name?: string | null
  target_model_code?: string | null
  target_model_name?: string | null
  relation_type: string
  relation_name: string | null
  description: string | null
  created_at: string
}

export interface IModelRelationCreate {
  target_model_id: number
  relation_type: string
  relation_name?: string | null
  description?: string | null
}
