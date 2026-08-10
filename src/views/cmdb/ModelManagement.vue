<template>
  <div class="model-management">
    <!-- 顶部栏 -->
    <div class="mgmt-header">
      <div class="header-info">
        <h3 class="page-title">模型设置</h3>
        <p class="page-desc">资产模型管理提供对所有资产模型及模型分组的创建与管理。您可以根据需求创建和管理它们。</p>
      </div>
      <div class="header-actions">
        <a-input-search v-model="searchKeyword" placeholder="搜索模型名称 / 编码..." allow-clear style="width: 240px" />
        <a-button type="primary" @click="handleAddModel">
          <template #icon><icon-plus /></template>新增模型
        </a-button>
        <a-button @click="handleAddCategory">
          <template #icon><icon-plus /></template>新增分组
        </a-button>
      </div>
    </div>

    <!-- 分组 + 卡片 -->
    <a-spin :loading="loading" style="width: 100%">
      <div class="mgmt-body">
        <div v-for="group in filteredGroups" :key="group.category.id" class="model-group">
          <!-- 分组标题 -->
          <div class="group-header">
            <span class="group-title">{{ group.category.name }} ({{ group.models.length }})</span>
            <a-space :size="4" class="group-actions">
              <a-button type="text" size="mini" @click="handleEditCategory(group.category.id)">
                <template #icon><icon-edit /></template>
              </a-button>
              <a-popconfirm content="删除分组将同时删除其下所有模型" @ok="handleDeleteCategory(group.category.id)">
                <a-button type="text" size="mini" status="danger">
                  <template #icon><icon-delete /></template>
                </a-button>
              </a-popconfirm>
            </a-space>
          </div>
          <!-- 模型卡片网格 -->
          <div class="model-grid">
            <div
              v-for="model in group.models"
              :key="model.id"
              class="model-card"
              @click="openModelDetail(model)"
            >
              <div class="card-icon">
                <icon-storage />
              </div>
              <div class="card-info">
                <span class="card-name">{{ model.name }}</span>
                <span class="card-code">{{ model.code }}</span>
              </div>
              <div class="card-count">{{ getModelCount(model.id) }}</div>
              <!-- 卡片操作 -->
              <div class="card-actions" @click.stop>
                <a-button type="text" size="mini" @click.stop="handleEditModel(model)">
                  <template #icon><icon-edit /></template>
                </a-button>
                <a-popconfirm v-if="!model.is_builtin" content="确定删除该模型？" @ok="handleDeleteModel(model.id)">
                  <a-button type="text" size="mini" status="danger" @click.stop>
                    <template #icon><icon-delete /></template>
                  </a-button>
                </a-popconfirm>
              </div>
            </div>
            <!-- 空状态 -->
            <div v-if="group.models.length === 0" class="group-empty">
              <a-empty description="该分组下暂无模型" />
            </div>
          </div>
        </div>
        <a-empty v-if="filteredGroups.length === 0 && !loading" description="暂无模型分组，请先新增分组" />
      </div>
    </a-spin>

    <!-- 分类弹窗 -->
    <a-modal v-model:visible="categoryModalVisible" :title="editingCategoryId ? '编辑分组' : '新增分组'" :width="440" :ok-loading="categoryModalLoading" @ok="handleCategorySubmit">
      <a-form :model="categoryForm" :rules="categoryRules" layout="vertical" ref="categoryFormRef">
        <a-form-item field="name" label="分组名称"><a-input v-model="categoryForm.name" placeholder="如：K8S、阿里云" /></a-form-item>
        <a-form-item field="code" label="编码"><a-input v-model="categoryForm.code" placeholder="如：kubernetes" :disabled="!!editingCategoryId" /></a-form-item>
        <a-form-item field="icon" label="图标标识"><a-input v-model="categoryForm.icon" placeholder="可选" /></a-form-item>
        <a-form-item field="sort_order" label="排序"><a-input-number v-model="categoryForm.sort_order" placeholder="数字越小越靠前" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 模型弹窗 -->
    <a-modal v-model:visible="modelModalVisible" :title="editingModelId ? '编辑模型' : '新增模型'" :width="520" :ok-loading="modelModalLoading" @ok="handleModelSubmit">
      <a-form :model="modelForm" :rules="modelRules" layout="vertical" ref="modelFormRef">
        <a-form-item field="category_id" label="所属分组">
          <a-select v-model="modelForm.category_id" placeholder="请选择分组">
            <a-option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</a-option>
          </a-select>
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="name" label="模型名称"><a-input v-model="modelForm.name" placeholder="如：K8S集群" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="code" label="编码"><a-input v-model="modelForm.code" placeholder="如：k8s_cluster" :disabled="!!editingModelId" /></a-form-item></a-col>
        </a-row>
        <a-form-item field="description" label="描述"><a-textarea v-model="modelForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
        <a-form-item field="icon" label="图标标识"><a-input v-model="modelForm.icon" placeholder="可选" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 模型详情抽屉 -->
    <a-drawer v-model:visible="detailDrawerVisible" :title="detailModel?.name || '模型详情'" :width="800" :footer="false">
      <a-tabs v-model:active-key="detailTab">
        <a-tab-pane key="fields" title="字段管理">
          <div style="margin-bottom: 12px; text-align: right;">
            <a-button type="primary" size="small" @click="handleAddField">
              <template #icon><icon-plus /></template>新增字段
            </a-button>
          </div>
          <a-table :data="detailFields" :columns="fieldColumns" :pagination="false" row-key="id" size="small">
            <template #field_type="{ record }"><a-tag size="small">{{ record.field_type }}</a-tag></template>
            <template #is_required="{ record }"><a-tag v-if="record.is_required" size="small" color="red">必填</a-tag><span v-else>-</span></template>
            <template #is_searchable="{ record }"><a-tag v-if="record.is_searchable" size="small" color="green">可搜</a-tag><span v-else>-</span></template>
            <template #actions="{ record }">
              <a-space :size="2">
                <a-button type="text" size="mini" @click="handleEditField(record)"><template #icon><icon-edit /></template></a-button>
                <a-popconfirm v-if="!record.is_builtin" content="确定删除？" @ok="handleDeleteField(record.id)">
                  <a-button type="text" size="mini" status="danger" @click.stop><template #icon><icon-delete /></template></a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="relations" title="关系定义">
          <div style="margin-bottom: 12px; text-align: right;">
            <a-button type="primary" size="small" @click="handleAddRelation">
              <template #icon><icon-plus /></template>新增关系
            </a-button>
          </div>
          <a-table :data="detailRelations" :columns="relationColumns" :pagination="false" row-key="id" size="small">
            <template #direction="{ record }">
              <a-tag :color="isOutgoing(record) ? 'blue' : 'orange'" size="small">
                {{ isOutgoing(record) ? '出' : '入' }}
              </a-tag>
            </template>
            <template #counterpart="{ record }">
              {{ counterpartName(record) || '-' }}
            </template>
            <template #relation_type="{ record }">
              <a-tag :color="record.relation_type === 'belongs_to' ? 'blue' : 'green'" size="small">
                {{ record.relation_type === 'belongs_to' ? '从属' : '关联' }}
              </a-tag>
            </template>
            <template #actions="{ record }">
              <a-popconfirm content="确定删除？" @ok="handleDeleteRelation(record.id)">
                <a-button type="text" size="mini" status="danger"><template #icon><icon-delete /></template></a-button>
              </a-popconfirm>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-drawer>

    <!-- 字段弹窗 -->
    <a-modal v-model:visible="fieldModalVisible" :title="editingFieldId ? '编辑字段' : '新增字段'" :width="560" :ok-loading="fieldModalLoading" @ok="handleFieldSubmit">
      <a-form :model="fieldForm" :rules="fieldRules" layout="vertical" ref="fieldFormRef">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="name" label="字段名称"><a-input v-model="fieldForm.name" placeholder="如：CPU 核数" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="code" label="编码"><a-input v-model="fieldForm.code" placeholder="如：cpu" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="field_type" label="字段类型">
              <a-select v-model="fieldForm.field_type">
                <a-option value="string">文本 string</a-option>
                <a-option value="number">数字 number</a-option>
                <a-option value="boolean">布尔 boolean</a-option>
                <a-option value="date">日期 date</a-option>
                <a-option value="datetime">日期时间 datetime</a-option>
                <a-option value="enum">单选枚举 enum</a-option>
                <a-option value="multi_enum">多选 multi_enum</a-option>
                <a-option value="password">密码 password</a-option>
                <a-option value="json">自由JSON json</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item field="group_name" label="分组"><a-input v-model="fieldForm.group_name" placeholder="如：基础信息" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item field="is_required" label="必填"><a-switch v-model="fieldForm.is_required" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item field="is_unique" label="唯一"><a-switch v-model="fieldForm.is_unique" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item field="is_searchable" label="可搜索"><a-switch v-model="fieldForm.is_searchable" /></a-form-item></a-col>
        </a-row>
        <a-form-item v-if="fieldForm.field_type === 'enum' || fieldForm.field_type === 'multi_enum'" label="枚举选项 (JSON)">
          <a-textarea v-model="fieldOptionsText" placeholder='[{"label":"运行中","value":"running"},{"label":"已停止","value":"stopped"}]' :auto-size="{ minRows: 2, maxRows: 6 }" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="default_value" label="默认值"><a-input v-model="fieldForm.default_value" placeholder="可选" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="placeholder" label="占位提示"><a-input v-model="fieldForm.placeholder" placeholder="可选" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 关系弹窗 -->
    <a-modal v-model:visible="relationModalVisible" title="新增关系" :width="480" :ok-loading="relationModalLoading" @ok="handleRelationSubmit">
      <a-form :model="relationForm" :rules="relationRules" layout="vertical" ref="relationFormRef">
        <a-form-item field="target_model_id" label="目标模型">
          <a-select v-model="relationForm.target_model_id" placeholder="请选择">
            <a-option v-for="m in allModels" :key="m.id" :value="m.id">{{ m.name }} ({{ m.code }})</a-option>
          </a-select>
        </a-form-item>
        <a-form-item field="relation_type" label="关系类型">
          <a-radio-group v-model="relationForm.relation_type">
            <a-radio value="belongs_to">从属 (belongs_to)</a-radio>
            <a-radio value="relates_to">关联 (relates_to)</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item field="relation_name" label="关系名称"><a-input v-model="relationForm.relation_name" placeholder="可选，如：运行于、依赖于" /></a-form-item>
        <a-form-item field="description" label="描述"><a-input v-model="relationForm.description" placeholder="可选" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconStorage } from '@arco-design/web-vue/es/icon'
import * as modelApi from '../../api/model'
import { getResourceStats } from '../../api/cmdb'
import type { IModelCategory, IModel, IModelField, IModelRelation } from '../../types/model'

// ========== 数据 ==========
const loading = ref(false)
const categories = ref<IModelCategory[]>([])
const allModels = ref<IModel[]>([])
const resourceStats = ref<Record<string, number>>({})
const searchKeyword = ref('')

// 按分类分组
const groupedModels = computed(() => {
  return categories.value.map(cat => ({
    category: cat,
    models: allModels.value.filter(m => m.category_id === cat.id),
  }))
})

// 搜索过滤
const filteredGroups = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return groupedModels.value
  return groupedModels.value
    .map(g => ({
      category: g.category,
      models: g.models.filter(m => m.name.toLowerCase().includes(kw) || m.code.toLowerCase().includes(kw)),
    }))
    .filter(g => g.models.length > 0 || g.category.name.toLowerCase().includes(kw))
})

function getModelCount(modelId: number): number {
  return resourceStats.value[String(modelId)] ?? 0
}

async function fetchAll() {
  loading.value = true
  try {
    const [catRes, modelRes, statsRes] = await Promise.all([
      modelApi.getModelCategories(),
      modelApi.getModels(),
      getResourceStats(),
    ])
    categories.value = catRes.data
    allModels.value = modelRes.data
    resourceStats.value = statsRes.data.by_model ?? {}
  } catch { Message.error('获取数据失败') } finally { loading.value = false }
}

// ========== 分类弹窗 ==========
const categoryModalVisible = ref(false)
const categoryModalLoading = ref(false)
const editingCategoryId = ref<number | null>(null)
const categoryFormRef = ref()
const categoryForm = reactive({ name: '', code: '', icon: '', sort_order: 0 })
const categoryRules = { name: [{ required: true, message: '请输入名称' }], code: [{ required: true, message: '请输入编码' }] }

function handleAddCategory() {
  editingCategoryId.value = null
  Object.assign(categoryForm, { name: '', code: '', icon: '', sort_order: 0 })
  categoryModalVisible.value = true
}

function handleEditCategory(id: number) {
  const cat = categories.value.find(c => c.id === id)
  if (!cat) return
  editingCategoryId.value = id
  Object.assign(categoryForm, { name: cat.name, code: cat.code, icon: cat.icon || '', sort_order: cat.sort_order })
  categoryModalVisible.value = true
}

async function handleCategorySubmit() {
  const errors = await categoryFormRef.value?.validate()
  if (errors) return
  categoryModalLoading.value = true
  try {
    if (editingCategoryId.value) {
      await modelApi.updateModelCategory(editingCategoryId.value, { name: categoryForm.name, icon: categoryForm.icon || null, sort_order: categoryForm.sort_order })
    } else {
      await modelApi.createModelCategory({ name: categoryForm.name, code: categoryForm.code, icon: categoryForm.icon || undefined, sort_order: categoryForm.sort_order })
    }
    Message.success(editingCategoryId.value ? '编辑成功' : '新增成功')
    categoryModalVisible.value = false
    fetchAll()
  } catch { Message.error('操作失败') } finally { categoryModalLoading.value = false }
}

async function handleDeleteCategory(id: number) {
  try { await modelApi.deleteModelCategory(id); Message.success('删除成功'); fetchAll() } catch { Message.error('删除失败') }
}

// ========== 模型弹窗 ==========
const modelModalVisible = ref(false)
const modelModalLoading = ref(false)
const editingModelId = ref<number | null>(null)
const modelFormRef = ref()
const modelForm = reactive({ category_id: undefined as number | undefined, name: '', code: '', description: '', icon: '' })
const modelRules = {
  category_id: [{ required: true, message: '请选择分组' }],
  name: [{ required: true, message: '请输入名称' }],
  code: [{ required: true, message: '请输入编码' }],
}

function handleAddModel() {
  editingModelId.value = null
  Object.assign(modelForm, { category_id: undefined, name: '', code: '', description: '', icon: '' })
  modelModalVisible.value = true
}

function handleEditModel(record: IModel) {
  editingModelId.value = record.id
  Object.assign(modelForm, { category_id: record.category_id, name: record.name, code: record.code, description: record.description || '', icon: record.icon || '' })
  modelModalVisible.value = true
}

async function handleModelSubmit() {
  const errors = await modelFormRef.value?.validate()
  if (errors) return
  modelModalLoading.value = true
  try {
    if (editingModelId.value) {
      await modelApi.updateModel(editingModelId.value, { name: modelForm.name, icon: modelForm.icon || null, description: modelForm.description || null })
    } else {
      await modelApi.createModel({ category_id: modelForm.category_id!, name: modelForm.name, code: modelForm.code, description: modelForm.description || undefined, icon: modelForm.icon || undefined })
    }
    Message.success(editingModelId.value ? '编辑成功' : '新增成功')
    modelModalVisible.value = false
    fetchAll()
  } catch { Message.error('操作失败') } finally { modelModalLoading.value = false }
}

async function handleDeleteModel(id: number) {
  try { await modelApi.deleteModel(id); Message.success('删除成功'); fetchAll() } catch { Message.error('删除失败') }
}

// ========== 模型详情（字段+关系）==========
const detailDrawerVisible = ref(false)
const detailTab = ref('fields')
const detailModel = ref<IModel | null>(null)
const detailFields = ref<IModelField[]>([])
const detailRelations = ref<IModelRelation[]>([])

const fieldColumns = [
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '编码', dataIndex: 'code', width: 110 },
  { title: '类型', slotName: 'field_type', width: 90 },
  { title: '分组', dataIndex: 'group_name', width: 100 },
  { title: '必填', slotName: 'is_required', width: 70 },
  { title: '可搜', slotName: 'is_searchable', width: 70 },
  { title: '操作', slotName: 'actions', width: 80 },
]

const relationColumns = [
  { title: '方向', slotName: 'direction', width: 70 },
  { title: '对端模型', slotName: 'counterpart', width: 140 },
  { title: '关系类型', slotName: 'relation_type', width: 100 },
  { title: '关系名称', dataIndex: 'relation_name', width: 120 },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '操作', slotName: 'actions', width: 70 },
]

async function openModelDetail(model: IModel) {
  detailModel.value = model
  detailTab.value = 'fields'
  detailDrawerVisible.value = true
  await Promise.all([fetchModelFields(model.id), fetchModelRelations(model.id)])
}

async function fetchModelFields(modelId: number) {
  try { const res = await modelApi.getModelFields(modelId); detailFields.value = res.data } catch { Message.error('获取字段失败') }
}

async function fetchModelRelations(modelId: number) {
  try { const res = await modelApi.getModelRelations(modelId); detailRelations.value = res.data } catch { Message.error('获取关系失败') }
}

// 关系列表含双向（source 或 target 为当前模型）：出 = 当前模型指向对端，入 = 对端指向当前模型
function isOutgoing(record: IModelRelation) {
  return record.source_model_id === detailModel.value?.id
}

function counterpartName(record: IModelRelation) {
  return isOutgoing(record) ? record.target_model_name : record.source_model_name
}

// 字段弹窗
const fieldModalVisible = ref(false)
const fieldModalLoading = ref(false)
const editingFieldId = ref<number | null>(null)
const fieldFormRef = ref()
const fieldOptionsText = ref('')
const fieldForm = reactive({
  name: '', code: '', field_type: 'string' as string, group_name: '', is_required: false, is_unique: false,
  is_searchable: true, default_value: '', placeholder: '',
})
const fieldRules = { name: [{ required: true, message: '请输入名称' }], code: [{ required: true, message: '请输入编码' }], field_type: [{ required: true, message: '请选择类型' }] }

function handleAddField() {
  editingFieldId.value = null
  Object.assign(fieldForm, { name: '', code: '', field_type: 'string', group_name: '', is_required: false, is_unique: false, is_searchable: true, default_value: '', placeholder: '' })
  fieldOptionsText.value = ''
  fieldModalVisible.value = true
}

function handleEditField(record: IModelField) {
  editingFieldId.value = record.id
  Object.assign(fieldForm, { name: record.name, code: record.code, field_type: record.field_type, group_name: record.group_name || '', is_required: record.is_required, is_unique: record.is_unique, is_searchable: record.is_searchable, default_value: record.default_value || '', placeholder: record.placeholder || '' })
  fieldOptionsText.value = record.options ? JSON.stringify(record.options, null, 2) : ''
  fieldModalVisible.value = true
}

async function handleFieldSubmit() {
  const errors = await fieldFormRef.value?.validate()
  if (errors) return
  let options: Array<{ label: string; value: string }> | null = null
  if (fieldOptionsText.value.trim()) {
    try { options = JSON.parse(fieldOptionsText.value) } catch { Message.error('枚举选项 JSON 格式不正确'); return }
  }
  fieldModalLoading.value = true
  try {
    const modelId = detailModel.value!.id
    if (editingFieldId.value) {
      await modelApi.updateModelField(modelId, editingFieldId.value, {
        name: fieldForm.name, group_name: fieldForm.group_name || null, is_required: fieldForm.is_required,
        is_unique: fieldForm.is_unique, is_searchable: fieldForm.is_searchable,
        default_value: fieldForm.default_value || null, placeholder: fieldForm.placeholder || null, options,
      })
    } else {
      await modelApi.createModelField(modelId, {
        name: fieldForm.name, code: fieldForm.code, field_type: fieldForm.field_type as any,
        group_name: fieldForm.group_name || null, is_required: fieldForm.is_required, is_unique: fieldForm.is_unique,
        is_searchable: fieldForm.is_searchable, default_value: fieldForm.default_value || null,
        placeholder: fieldForm.placeholder || null, options,
      })
    }
    Message.success(editingFieldId.value ? '编辑成功' : '新增成功')
    fieldModalVisible.value = false
    fetchModelFields(modelId)
  } catch { Message.error('操作失败') } finally { fieldModalLoading.value = false }
}

async function handleDeleteField(fieldId: number) {
  try { await modelApi.deleteModelField(detailModel.value!.id, fieldId); Message.success('删除成功'); fetchModelFields(detailModel.value!.id) } catch { Message.error('删除失败') }
}

// 关系弹窗
const relationModalVisible = ref(false)
const relationModalLoading = ref(false)
const relationFormRef = ref()
const relationForm = reactive({ target_model_id: undefined as number | undefined, relation_type: 'belongs_to', relation_name: '', description: '' })
const relationRules = { target_model_id: [{ required: true, message: '请选择目标模型' }], relation_type: [{ required: true, message: '请选择类型' }] }

function handleAddRelation() {
  Object.assign(relationForm, { target_model_id: undefined, relation_type: 'belongs_to', relation_name: '', description: '' })
  relationModalVisible.value = true
}

async function handleRelationSubmit() {
  const errors = await relationFormRef.value?.validate()
  if (errors) return
  relationModalLoading.value = true
  try {
    await modelApi.createModelRelation(detailModel.value!.id, {
      target_model_id: relationForm.target_model_id!, relation_type: relationForm.relation_type,
      relation_name: relationForm.relation_name || null,
      description: relationForm.description || null,
    })
    Message.success('新增成功')
    relationModalVisible.value = false
    fetchModelRelations(detailModel.value!.id)
  } catch { Message.error('操作失败') } finally { relationModalLoading.value = false }
}

async function handleDeleteRelation(relationId: number) {
  try { await modelApi.deleteModelRelation(detailModel.value!.id, relationId); Message.success('删除成功'); fetchModelRelations(detailModel.value!.id) } catch { Message.error('删除失败') }
}

onMounted(() => fetchAll())
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.model-management { width: 100%; }

.mgmt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: $spacing-lg;
}

.header-info {
  .page-title {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $text-primary;
    margin: 0 0 $spacing-xs;
  }
  .page-desc {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin: 0;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-shrink: 0;
}

.mgmt-body {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.model-group {
  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;

    .group-title {
      font-size: $font-size-base;
      font-weight: 600;
      color: $text-primary;
    }

    .group-actions {
      opacity: 0;
      transition: opacity $transition-fast;
    }

    &:hover .group-actions { opacity: 1; }
  }
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: $spacing-md;
}

.model-card {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-md;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  cursor: pointer;
  transition: all $transition-fast;
  position: relative;

  &:hover {
    border-color: $border-glow;
    box-shadow: $shadow-glow;
    background: $bg-card-hover;

    .card-actions { opacity: 1; }
  }

  .card-icon {
    width: 40px;
    height: 40px;
    border-radius: $radius-sm;
    background: linear-gradient(135deg, rgba(22, 119, 255, 0.1), rgba(89, 126, 247, 0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: $color-primary;
    font-size: 20px;
  }

  .card-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .card-name {
      font-size: $font-size-base;
      font-weight: 500;
      color: $text-body;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-code {
      font-size: $font-size-xs;
      color: $text-secondary;
      font-family: $font-mono;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .card-count {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: $color-primary;
    color: #fff;
    font-size: $font-size-xs;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    opacity: 0;
    transition: opacity $transition-fast;
    display: flex;
    gap: 2px;
  }
}

.group-empty {
  grid-column: 1 / -1;
  padding: $spacing-lg;
}
</style>
