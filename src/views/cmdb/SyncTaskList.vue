<template>
  <div class="sync-task-list">
    <!-- 筛选栏 -->
    <a-card class="filter-card" :bordered="false">
      <div class="filter-bar">
        <div class="filter-left">
          <a-input-search v-model="queryParams.keyword" placeholder="搜索任务名称" allow-clear style="width: 240px" @search="handleSearch" />
          <a-select v-model="queryParams.task_type" placeholder="任务类型" allow-clear style="width: 130px" @change="handleSearch">
            <a-option value="k8s">K8S</a-option>
            <a-option value="cloud">云厂商</a-option>
          </a-select>
          <a-select v-model="enabledFilter" placeholder="启用状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-option value="true">已启用</a-option>
            <a-option value="false">已禁用</a-option>
          </a-select>
        </div>
        <div class="filter-right">
          <a-button type="primary" @click="handleCreate">
            <template #icon><icon-plus /></template>新增任务
          </a-button>
          <a-button @click="fetchTasks">
            <template #icon><icon-refresh /></template>
          </a-button>
        </div>
      </div>
    </a-card>

    <!-- 表格 -->
    <a-card class="table-card" :bordered="false">
      <a-table
        :data="tableData"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #empty>
          <div class="empty-state">
            <icon-sync :style="{ fontSize: '48px', color: '#c9cdd4' }" />
            <p class="empty-title">暂无同步任务</p>
            <p class="empty-desc">创建同步任务后，系统将自动从 K8S 集群或云厂商拉取资源</p>
            <a-button type="primary" size="small" @click="handleCreate"><template #icon><icon-plus /></template>新增任务</a-button>
          </div>
        </template>
        <template #task_type="{ record }">
          <a-tag size="small" :color="record.task_type === 'k8s' ? 'purple' : 'arcoblue'">{{ record.task_type === 'k8s' ? 'K8S' : '云厂商' }}</a-tag>
        </template>
        <template #provider="{ record }">
          {{ record.provider ? (providerMap[record.provider] || record.provider) : '-' }}
        </template>
        <template #resource_types="{ record }">
          <a-space wrap size="mini">
            <a-tag v-for="rt in (record.resource_types || [])" :key="rt" size="small">{{ rt }}</a-tag>
            <span v-if="!record.resource_types?.length">-</span>
          </a-space>
        </template>
        <template #enabled="{ record }">
          <a-switch :model-value="record.enabled" size="small" :loading="togglingId === record.id" @change="(v: string | number | boolean) => handleToggle(record, Boolean(v))" />
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleEdit(record)">
              <template #icon><icon-edit /></template>
            </a-button>
            <a-popconfirm content="确定删除该同步任务？" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger">
                <template #icon><icon-delete /></template>
              </a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑任务' : '新增任务'" :width="560" :ok-loading="formLoading" @ok="handleFormSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-form-item field="name" label="任务名称">
          <a-input v-model="formData.name" placeholder="如：生产集群资源同步" />
        </a-form-item>
        <a-form-item field="task_type" label="任务类型">
          <a-radio-group v-model="formData.task_type" :disabled="!!editingId">
            <a-radio value="k8s">K8S 集群</a-radio>
            <a-radio value="cloud">云厂商</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="formData.task_type === 'cloud'" field="provider" label="云厂商">
          <a-select v-model="formData.provider" placeholder="请选择">
            <a-option value="aliyun">阿里云</a-option>
            <a-option value="aws">AWS</a-option>
            <a-option value="gcp">谷歌云</a-option>
          </a-select>
        </a-form-item>
        <a-form-item field="target_id" :label="formData.task_type === 'k8s' ? '集群 ID' : '云账号 ID'">
          <a-input v-model="formData.target_id" :placeholder="formData.task_type === 'k8s' ? 'K8S 集群标识' : '云账号标识'" :disabled="!!editingId" />
        </a-form-item>
        <a-form-item field="resource_types" label="同步资源类型">
          <a-input-tag v-model="formData.resource_types" placeholder="输入后回车，如 pod、deployment" allow-clear />
        </a-form-item>
        <a-form-item v-if="formData.task_type === 'cloud'" field="schedule" label="调度周期（cron）">
          <a-input v-model="formData.schedule" placeholder="如 0 */30 * * * （可选）" />
        </a-form-item>
        <a-form-item field="enabled" label="启用">
          <a-switch v-model="formData.enabled" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-input v-model="formData.description" placeholder="可选" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh, IconEdit, IconDelete, IconSync } from '@arco-design/web-vue/es/icon'
import { getSyncTasks, createSyncTask, updateSyncTask, deleteSyncTask, toggleSyncTask } from '../../api/syncTask'
import type { ISyncTask, ISyncTaskCreate, ISyncTaskUpdate, ISyncTaskQuery } from '../../api/syncTask'

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云' }

const columns = [
  { title: '任务名称', dataIndex: 'name', width: 200, ellipsis: true },
  { title: '类型', slotName: 'task_type', width: 90 },
  { title: '云厂商', slotName: 'provider', width: 100 },
  { title: '目标标识', dataIndex: 'target_id', width: 180, ellipsis: true },
  { title: '资源类型', slotName: 'resource_types', width: 220 },
  { title: '调度周期', dataIndex: 'schedule', width: 130, render: ({ record }: { record: ISyncTask }) => record.schedule || '-' },
  { title: '启用', slotName: 'enabled', width: 80 },
  { title: '描述', dataIndex: 'description', ellipsis: true, render: ({ record }: { record: ISyncTask }) => record.description || '-' },
  { title: '操作', slotName: 'actions', width: 110 },
]

// ========== 列表 ==========
const loading = ref(false)
const tableData = ref<ISyncTask[]>([])
const queryParams = reactive<ISyncTaskQuery>({ keyword: undefined, task_type: undefined })
const enabledFilter = ref<string | undefined>()
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

async function fetchTasks() {
  loading.value = true
  try {
    const res = await getSyncTasks({
      ...queryParams,
      enabled: enabledFilter.value === undefined ? undefined : enabledFilter.value === 'true',
      page: pagination.current,
      page_size: pagination.pageSize,
    })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取同步任务失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchTasks() }
function onPageChange(page: number) { pagination.current = page; fetchTasks() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchTasks() }

// ========== 启停 ==========
const togglingId = ref<number | null>(null)

async function handleToggle(record: ISyncTask, enabled: boolean) {
  togglingId.value = record.id
  try {
    await toggleSyncTask(record.id, enabled)
    record.enabled = enabled
    Message.success(enabled ? '已启用' : '已禁用')
  } catch { Message.error('操作失败') } finally { togglingId.value = null }
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()

interface IFormModel {
  name: string
  task_type: string
  provider: string
  target_id: string
  resource_types: string[]
  schedule: string
  enabled: boolean
  description: string
}

const defaultForm = (): IFormModel => ({
  name: '', task_type: 'k8s', provider: '', target_id: '', resource_types: [], schedule: '', enabled: true, description: '',
})

const formData = reactive<IFormModel>(defaultForm())
const formRules = {
  name: [{ required: true, message: '请输入任务名称' }],
  task_type: [{ required: true, message: '请选择任务类型' }],
  target_id: [{ required: true, message: '请输入目标标识' }],
}

function handleCreate() {
  editingId.value = null
  Object.assign(formData, defaultForm())
  formVisible.value = true
}

function handleEdit(record: ISyncTask) {
  editingId.value = record.id
  Object.assign(formData, {
    name: record.name, task_type: record.task_type, provider: record.provider || '',
    target_id: record.target_id, resource_types: [...(record.resource_types || [])],
    schedule: record.schedule || '', enabled: record.enabled, description: record.description || '',
  })
  formVisible.value = true
}

async function handleFormSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  formLoading.value = true
  try {
    if (editingId.value) {
      const data: ISyncTaskUpdate = {
        name: formData.name, provider: formData.provider || undefined,
        resource_types: formData.resource_types, schedule: formData.schedule || undefined,
        enabled: formData.enabled, description: formData.description || undefined,
      }
      await updateSyncTask(editingId.value, data)
      Message.success('编辑成功')
    } else {
      const data: ISyncTaskCreate = {
        name: formData.name, task_type: formData.task_type,
        provider: formData.provider || undefined, target_id: formData.target_id,
        resource_types: formData.resource_types, schedule: formData.schedule || undefined,
        enabled: formData.enabled, description: formData.description || undefined,
      }
      await createSyncTask(data)
      Message.success('新增成功')
    }
    formVisible.value = false
    fetchTasks()
  } catch { Message.error(editingId.value ? '编辑失败' : '新增失败') } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await deleteSyncTask(id); Message.success('删除成功'); fetchTasks() } catch { Message.error('删除失败') }
}

onMounted(fetchTasks)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.sync-task-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
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
