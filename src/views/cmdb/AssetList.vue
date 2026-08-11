<template>
  <div class="resource-list">
    <div class="res-layout">
      <!-- 左侧：模型分类树 -->
      <a-card class="model-panel" :bordered="false" title="模型导航">
        <template #extra>
          <a-button type="text" size="small" @click="selectedModelId = undefined; selectedCategoryKeys = []; fetchResources()">
            <template #icon><icon-refresh /></template>
          </a-button>
        </template>
        <a-tree
          :data="modelTreeData"
          :selected-keys="selectedCategoryKeys"
          show-line
          block-node
          @select="onTreeSelect"
        />
        <a-button long type="outline" size="small" style="margin-top: 12px" @click="selectedModelId = undefined; selectedCategoryKeys = []; fetchResources()">
          查看全部资源
        </a-button>
      </a-card>

      <!-- 右侧：资源表格 -->
      <div class="table-panel">
        <!-- 搜索栏 -->
        <a-card class="filter-card" :bordered="false">
          <div class="filter-bar">
            <div class="filter-left">
              <a-input-search
                v-model="queryParams.keyword"
                placeholder="搜索资源名称 / Provider ID"
                allow-clear
                style="width: 260px"
                @search="handleSearch"
              />
              <a-select v-model="queryParams.provider" placeholder="云厂商" allow-clear style="width: 140px" @change="handleSearch">
                <a-option value="aliyun">阿里云</a-option>
                <a-option value="aws">AWS</a-option>
                <a-option value="gcp">谷歌云</a-option>
                <a-option value="k8s">Kubernetes</a-option>
                <a-option value="manual">手动录入</a-option>
              </a-select>
              <a-select v-model="queryParams.status" placeholder="状态" allow-clear style="width: 120px" @change="handleSearch">
                <a-option value="running">运行中</a-option>
                <a-option value="stopped">已停止</a-option>
                <a-option value="maintenance">维护中</a-option>
                <a-option value="unknown">未知</a-option>
              </a-select>
            </div>
            <div class="filter-right">
              <a-button type="primary" @click="handleCreate">
                <template #icon><icon-plus /></template>新增资源
              </a-button>
              <a-button @click="handleRefresh">
                <template #icon><icon-refresh /></template>
              </a-button>
            </div>
          </div>
        </a-card>

        <!-- 当前视图指示 -->
        <div class="view-indicator" v-if="selectedModelName || queryParams.provider || queryParams.status">
          <span class="view-label">当前视图：</span>
          <a-tag v-if="selectedModelName" closable color="arcoblue" @close="clearModelFilter">{{ selectedModelName }}</a-tag>
          <a-tag v-if="queryParams.provider" closable color="blue" @close="queryParams.provider = undefined; handleSearch()">{{ providerText(queryParams.provider) }}</a-tag>
          <a-tag v-if="queryParams.status" closable color="orangered" @close="queryParams.status = undefined; handleSearch()">{{ statusText(queryParams.status) }}</a-tag>
          <a-button type="text" size="mini" @click="resetAllFilters">清除全部</a-button>
        </div>

        <!-- 统计卡片 -->
        <a-row :gutter="12" v-if="stats" class="stats-row">
          <a-col :span="6">
            <a-card :bordered="false" class="stat-card"><a-statistic title="资源总数" :value="stats.total" /></a-card>
          </a-col>
          <a-col :span="6">
            <a-card :bordered="false" class="stat-card"><a-statistic title="运行中" :value="stats.by_status?.running ?? 0" :value-style="{ color: (stats.by_status?.running ?? 0) > 0 ? '#52c41a' : undefined }" /></a-card>
          </a-col>
          <a-col :span="6">
            <a-card :bordered="false" class="stat-card"><a-statistic title="已停止" :value="stats.by_status?.stopped ?? 0" :value-style="{ color: (stats.by_status?.stopped ?? 0) > 0 ? '#ff4d4f' : undefined }" /></a-card>
          </a-col>
          <a-col :span="6">
            <a-card :bordered="false" class="stat-card"><a-statistic title="模型数" :value="Object.keys(stats.by_model ?? {}).length" /></a-card>
          </a-col>
        </a-row>

        <!-- 表格 -->
        <a-card class="table-card" :bordered="false">
          <a-table
            :data="tableData"
            :columns="tableColumns"
            :loading="loading"
            :pagination="pagination"
            row-key="id"
            :scroll="{ x: tableColumns.length * 140 }"
            @page-change="onPageChange"
            @page-size-change="onPageSizeChange"
          >
            <template #empty>
              <div class="empty-state">
                <icon-storage :style="{ fontSize: '48px', color: '#c9cdd4' }" />
                <p class="empty-title">暂无资源数据</p>
                <p class="empty-desc" v-if="selectedModelName || queryParams.provider || queryParams.status">当前筛选条件下没有匹配的资源，试试调整筛选条件</p>
                <p class="empty-desc" v-else>还没有任何资源，点击下方按钮添加第一个资源</p>
                <a-space>
                  <a-button type="primary" size="small" @click="handleCreate"><template #icon><icon-plus /></template>新增资源</a-button>
                  <a-button v-if="selectedModelName || queryParams.provider || queryParams.status" size="small" @click="resetAllFilters">重置筛选</a-button>
                </a-space>
              </div>
            </template>
            <template #name="{ record }">
              <a-link @click="goDetail(record.id)">{{ record.name }}</a-link>
            </template>
            <template #model_name="{ record }">
              <a-tag size="small" color="arcoblue">{{ record.model_name || selectedModelName || '-' }}</a-tag>
            </template>
            <template #provider="{ record }">
              <a-tag v-if="record.provider" size="small" color="arcoblue">{{ providerText(record.provider) }}</a-tag>
              <span v-else>-</span>
            </template>
            <template #status="{ record }">
              <div class="status-cell">
                <span class="status-dot" :class="`status-${record.status}`"></span>
                {{ statusText(record.status) }}
              </div>
            </template>
            <template #source="{ record }">
              <a-tag size="small" :color="sourceColor(record.source)">{{ sourceText(record.source) }}</a-tag>
            </template>
            <template #updated_at="{ record }">
              {{ record.updated_at ? formatTime(record.updated_at) : '-' }}
            </template>
            <template #actions="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="goDetail(record.id)">
                  <template #icon><icon-eye /></template>
                </a-button>
                <a-button type="text" size="small" @click="handleEdit(record)">
                  <template #icon><icon-edit /></template>
                </a-button>
                <a-popconfirm content="确定删除该资源？" @ok="handleDelete(record.id)">
                  <a-button type="text" size="small" status="danger">
                    <template #icon><icon-delete /></template>
                  </a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table>
        </a-card>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <a-modal
      v-model:visible="formVisible"
      :title="editingId ? '编辑资源' : '新增资源'"
      :width="720"
      :ok-loading="formLoading"
      @ok="handleFormSubmit"
    >
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="model_id" label="所属模型">
              <a-select v-model="formData.model_id" placeholder="请选择模型" :disabled="!!editingId" @change="onFormModelChange">
                <a-option v-for="m in allModels" :key="m.id" :value="m.id">{{ m.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="name" label="资源名称">
              <a-input v-model="formData.name" placeholder="请输入资源名称" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="provider" label="云厂商">
              <a-select v-model="formData.provider" placeholder="可选" allow-clear :disabled="!!editingId">
                <a-option value="aliyun">阿里云</a-option>
                <a-option value="aws">AWS</a-option>
                <a-option value="gcp">谷歌云</a-option>
                <a-option value="k8s">Kubernetes</a-option>
                <a-option value="manual">手动录入</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="provider_id" label="Provider ID">
              <a-input v-model="formData.provider_id" placeholder="可选，云资源实例 ID" :disabled="!!editingId" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="cloud_account" label="云账号">
              <a-input v-model="formData.cloud_account" placeholder="可选，云账号标识" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="status" label="状态">
              <a-select v-model="formData.status" placeholder="请选择">
                <a-option value="running">运行中</a-option>
                <a-option value="stopped">已停止</a-option>
                <a-option value="maintenance">维护中</a-option>
                <a-option value="unknown">未知</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="region" label="地域"><a-input v-model="formData.region" placeholder="如 cn-beijing" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="zone" label="可用区"><a-input v-model="formData.zone" placeholder="如 cn-beijing-a" /></a-form-item>
          </a-col>
        </a-row>
        <!-- 动态字段 -->
        <a-divider v-if="formFieldDefs.length > 0">扩展字段</a-divider>
        <a-row :gutter="16">
          <a-col v-for="fd in formFieldDefs" :key="fd.code" :span="fd.field_type === 'json' || fd.field_type === 'password' ? 24 : 12">
            <a-form-item :field="`fields.${fd.code}`" :label="fd.name" :rules="fd.is_required ? [{ required: true, message: `请输入${fd.name}` }] : []">
              <!-- string -->
              <a-input v-if="fd.field_type === 'string'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请输入${fd.name}`" />
              <!-- number -->
              <a-input-number v-else-if="fd.field_type === 'number'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请输入${fd.name}`" style="width:100%" />
              <!-- boolean -->
              <a-switch v-else-if="fd.field_type === 'boolean'" v-model="dynamicFields[fd.code]" />
              <!-- date -->
              <a-date-picker v-else-if="fd.field_type === 'date'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || '请选择日期'" style="width:100%" />
              <!-- datetime -->
              <a-date-picker v-else-if="fd.field_type === 'datetime'" v-model="dynamicFields[fd.code]" show-time :placeholder="fd.placeholder || '请选择时间'" style="width:100%" />
              <!-- enum -->
              <a-select v-else-if="fd.field_type === 'enum'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请选择${fd.name}`" allow-clear>
                <a-option v-for="opt in (fd.options || [])" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
              </a-select>
              <!-- multi_enum -->
              <a-select v-else-if="fd.field_type === 'multi_enum'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请选择${fd.name}`" allow-clear multiple>
                <a-option v-for="opt in (fd.options || [])" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
              </a-select>
              <!-- password -->
              <a-input-password v-else-if="fd.field_type === 'password'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请输入${fd.name}`" />
              <!-- json -->
              <a-textarea v-else-if="fd.field_type === 'json'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || 'JSON 格式'" :auto-size="{ minRows: 2, maxRows: 6 }" />
              <a-input v-else v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || `请输入${fd.name}`" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh, IconEye, IconEdit, IconDelete, IconStorage } from '@arco-design/web-vue/es/icon'
import { getResourceList, getResourceStats, createResource, updateResource, deleteResource } from '../../api/cmdb'
import type { ICmdbResource, IResourceQuery, IResourceCreate, IResourceUpdate } from '../../api/cmdb'
import * as modelApi from '../../api/model'
import type { IModel, IModelField, IModelCategory } from '../../types/model'

const router = useRouter()

// ========== 模型树 ==========
const categories = ref<IModelCategory[]>([])
const allModels = ref<IModel[]>([])
const selectedModelId = ref<number | undefined>()
const selectedCategoryKeys = ref<number[]>([])
const modelFieldMap = ref<Record<number, IModelField[]>>({}) // modelId -> fields

const selectedModelName = computed(() => {
  if (!selectedModelId.value) return ''
  return allModels.value.find(m => m.id === selectedModelId.value)?.name || ''
})

// Build tree: category nodes -> model children
const modelTreeData = computed(() => {
  return categories.value.map(cat => {
    const models = allModels.value.filter(m => m.category_id === cat.id && m.is_enabled)
    return {
      key: `cat_${cat.id}`,
      title: cat.name,
      children: models.map(m => ({ key: m.id, title: m.name })),
    }
  })
})

function onTreeSelect(keys: (string | number)[]) {
  if (keys.length === 0) {
    selectedModelId.value = undefined
    selectedCategoryKeys.value = []
  } else {
    const key = keys[0]
    if (typeof key === 'number') {
      selectedModelId.value = key
      selectedCategoryKeys.value = [key]
    } else {
      // category node, don't filter
      selectedModelId.value = undefined
      selectedCategoryKeys.value = []
    }
  }
  fetchResources()
}

async function fetchModelsAndCategories() {
  try {
    const [catRes, modelRes] = await Promise.all([
      modelApi.getModelCategories(),
      modelApi.getModels(),
    ])
    categories.value = catRes.data
    allModels.value = modelRes.data
  } catch { /* ignore */ }
}

async function fetchModelFields(modelId: number) {
  if (modelFieldMap.value[modelId]) return
  try {
    const res = await modelApi.getModelFields(modelId)
    modelFieldMap.value[modelId] = res.data
  } catch { /* ignore */ }
}

// ========== 动态列 ==========
const currentModelFields = computed(() => {
  if (!selectedModelId.value) return []
  return (modelFieldMap.value[selectedModelId.value] || []).filter(f => f.is_searchable)
})

const tableColumns = computed(() => {
  const fixed: any[] = [
    { title: '资源名称', slotName: 'name', width: 180, ellipsis: true },
    { title: '模型', slotName: 'model_name', width: 130 },
    { title: '云厂商', slotName: 'provider', width: 100 },
    { title: '状态', slotName: 'status', width: 100 },
    { title: '地域', dataIndex: 'region', width: 120, ellipsis: true },
  ]
  // dynamic columns from searchable fields
  const dynCols = currentModelFields.value.map(f => ({
    title: f.name,
    dataIndex: `fields.${f.code}`,
    width: 130,
    ellipsis: true,
    render: ({ record }: any) => formatFieldCell(record.fields?.[f.code]),
  }))
  const actionCols: any[] = [
    { title: '来源', slotName: 'source', width: 100 },
    { title: '更新时间', slotName: 'updated_at', width: 170 },
    { title: '操作', slotName: 'actions', width: 130, fixed: 'right' },
  ]
  return [...fixed, ...dynCols, ...actionCols]
})

// 复杂字段单元格展示：对象数组优先展示 name 摘要，其余回退 JSON
function formatFieldCell(val: unknown): string {
  if (val === null || val === undefined) return '-'
  if (Array.isArray(val)) {
    if (val.length === 0) return '-'
    if (val.every(i => i !== null && typeof i === 'object' && 'name' in (i as Record<string, unknown>))) {
      return val.map(i => String((i as Record<string, unknown>).name)).join(', ')
    }
    return JSON.stringify(val)
  }
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

// ========== 资源列表 ==========
const queryParams = reactive<IResourceQuery>({
  keyword: undefined,
  provider: undefined,
  status: undefined,
  model_id: undefined,
  page: 1,
  page_size: 15,
})

const loading = ref(false)
const tableData = ref<ICmdbResource[]>([])
const stats = ref<{ total: number; by_model: Record<string, number>; by_status: Record<string, number>; by_provider: Record<string, number> } | null>(null)

const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云', k8s: 'Kubernetes', manual: '手动录入' }
const statusMap: Record<string, string> = { running: '运行中', stopped: '已停止', maintenance: '维护中', unknown: '未知' }

function providerText(p: string) { return providerMap[p] || p }
function statusText(s: string) { return statusMap[s] || s }
function sourceText(s: string) { return s === 'discovery' ? '自动发现' : s === 'kafka' ? 'Kafka' : '手动录入' }
function sourceColor(s: string) { return s === 'discovery' ? 'green' : s === 'kafka' ? 'purple' : 'orange' }
function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function fetchResources() {
  loading.value = true
  queryParams.model_id = selectedModelId.value
  try {
    const res = await getResourceList({ ...queryParams, page: pagination.current, page_size: pagination.pageSize })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取资源列表失败') } finally { loading.value = false }
}

async function fetchStats() {
  try { const res = await getResourceStats(); stats.value = res.data } catch { /* ignore */ }
}

function handleSearch() { pagination.current = 1; fetchResources() }
function handleRefresh() { fetchResources(); fetchStats() }
function onPageChange(page: number) { pagination.current = page; fetchResources() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchResources() }
function goDetail(id: number) { router.push({ name: 'ResourceDetail', params: { id: String(id) } }) }

function clearModelFilter() {
  selectedModelId.value = undefined
  selectedCategoryKeys.value = []
  handleSearch()
}

function resetAllFilters() {
  selectedModelId.value = undefined
  selectedCategoryKeys.value = []
  queryParams.keyword = undefined
  queryParams.provider = undefined
  queryParams.status = undefined
  pagination.current = 1
  fetchResources()
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const dynamicFields = reactive<Record<string, any>>({})

interface IFormModel {
  model_id: number | undefined
  name: string
  provider: string
  provider_id: string
  cloud_account: string
  status: string
  region: string
  zone: string
}

const defaultForm = (): IFormModel => ({
  model_id: undefined, name: '', provider: '', provider_id: '', cloud_account: '', status: 'running', region: '', zone: '',
})

const formData = reactive<IFormModel>(defaultForm())
const formRules = {
  model_id: [{ required: true, message: '请选择模型' }],
  name: [{ required: true, message: '请输入资源名称' }],
}

// Dynamic field definitions for current form model
const formFieldDefs = computed(() => {
  if (!formData.model_id) return []
  return modelFieldMap.value[formData.model_id] || []
})

async function onFormModelChange(value: unknown) {
  const modelId = Number(value)
  // reset dynamic fields
  Object.keys(dynamicFields).forEach(k => delete dynamicFields[k])
  if (modelId) {
    await fetchModelFields(modelId)
    // set default values
    const fields = modelFieldMap.value[modelId] || []
    fields.forEach(f => {
      if (f.default_value) dynamicFields[f.code] = f.field_type === 'boolean' ? f.default_value === 'true' : f.default_value
      else if (f.field_type === 'multi_enum') dynamicFields[f.code] = []
      else dynamicFields[f.code] = undefined
    })
  }
}

function handleCreate() {
  editingId.value = null
  Object.assign(formData, defaultForm())
  formData.model_id = selectedModelId.value
  Object.keys(dynamicFields).forEach(k => delete dynamicFields[k])
  if (selectedModelId.value) onFormModelChange(selectedModelId.value)
  formVisible.value = true
}

function handleEdit(record: ICmdbResource) {
  editingId.value = record.id
  Object.assign(formData, {
    model_id: record.model_id, name: record.name, provider: record.provider || '',
    provider_id: record.provider_id || '', cloud_account: record.cloud_account || '',
    status: record.status, region: record.region || '', zone: record.zone || '',
  })
  Object.keys(dynamicFields).forEach(k => delete dynamicFields[k])
  // populate dynamic fields from record.fields
  fetchModelFields(record.model_id).then(() => {
    const fields = modelFieldMap.value[record.model_id] || []
    fields.forEach(f => {
      const val = record.fields?.[f.code]
      if (val === null || val === undefined) {
        dynamicFields[f.code] = f.field_type === 'multi_enum' ? [] : undefined
      } else if (typeof val === 'object' && f.field_type !== 'multi_enum') {
        // json 等复杂对象回显为格式化 JSON 文本，避免 textarea 显示 [object Object]
        dynamicFields[f.code] = JSON.stringify(val, null, 2)
      } else {
        dynamicFields[f.code] = val
      }
    })
  })
  formVisible.value = true
}

function buildFieldsPayload(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  formFieldDefs.value.forEach(f => {
    const val = dynamicFields[f.code]
    if (val !== undefined && val !== null && val !== '') {
      if (f.field_type === 'json' && typeof val === 'string') {
        try { result[f.code] = JSON.parse(val) } catch { result[f.code] = val }
      } else {
        result[f.code] = val
      }
    }
  })
  return result
}

async function handleFormSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  formLoading.value = true
  try {
    const fields = buildFieldsPayload()
    if (editingId.value) {
      const data: IResourceUpdate = { name: formData.name, status: formData.status, region: formData.region || undefined, zone: formData.zone || undefined, fields }
      await updateResource(editingId.value, data)
      Message.success('编辑成功')
    } else {
      const data: IResourceCreate = {
        model_id: formData.model_id!, name: formData.name, status: formData.status,
        provider: formData.provider || undefined, provider_id: formData.provider_id || undefined,
        cloud_account: formData.cloud_account || undefined,
        region: formData.region || undefined, zone: formData.zone || undefined, fields,
      }
      await createResource(data)
      Message.success('新增成功')
    }
    formVisible.value = false
    fetchResources()
    fetchStats()
  } catch { Message.error(editingId.value ? '编辑失败' : '新增失败') } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await deleteResource(id); Message.success('删除成功'); fetchResources(); fetchStats() } catch { Message.error('删除失败') }
}

// Watch selectedModelId to load fields
watch(selectedModelId, (id) => { if (id) fetchModelFields(id) })

onMounted(async () => {
  await fetchModelsAndCategories()
  fetchResources()
  fetchStats()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.resource-list { width: 100%; }

.res-layout {
  display: flex;
  gap: $spacing-md;
}

.model-panel {
  width: 240px;
  flex-shrink: 0;
  background: $bg-card;
  border: 1px solid $border-color-light;
  height: fit-content;
}

.table-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.stats-row {
  .stat-card {
    background: $bg-card;
    border: 1px solid $border-color-light;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
}

.filter-card, .table-card {
  background: $bg-card;
  border: 1px solid $border-color-light;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: $spacing-md;
}

.filter-left { display: flex; align-items: center; gap: $spacing-sm; }
.filter-right { display: flex; align-items: center; gap: $spacing-sm; }

.status-cell { display: flex; align-items: center; gap: 6px; }

.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  &.status-running { background: $color-success; box-shadow: 0 0 6px rgba(82,196,26,0.5); }
  &.status-stopped { background: $color-danger; box-shadow: 0 0 6px rgba(255,77,79,0.4); }
  &.status-maintenance { background: $color-warning; box-shadow: 0 0 6px rgba(250,173,20,0.4); }
  &.status-unknown { background: $text-disabled; }
}

.view-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f7f8fa;
  border-radius: $radius-md;
  font-size: 13px;

  .view-label { color: $text-secondary; white-space: nowrap; }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 8px;

  .empty-title {
    margin: 8px 0 0;
    font-size: 15px;
    font-weight: 500;
    color: $text-primary;
  }

  .empty-desc {
    margin: 0 0 12px;
    font-size: 13px;
    color: $text-secondary;
  }
}
</style>
