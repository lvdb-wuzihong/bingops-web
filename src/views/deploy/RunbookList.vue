<template>
  <div class="runbook-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">Runbook 管理</span>
        <a-space>
          <a-input-search v-model="queryParams.keyword" placeholder="搜索名称" allow-clear style="width: 200px" @search="handleSearch" />
          <a-input v-model="queryParams.category" placeholder="分类" allow-clear style="width: 140px" @change="handleSearch" />
          <a-button type="primary" @click="handleCreate">
            <template #icon><icon-plus /></template>新增 Runbook
          </a-button>
          <a-button @click="fetchData">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>
      <a-table
        :data="tableData"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #empty>
          <div class="empty-state">
            <icon-code :style="{ fontSize: '48px', color: '#c9cdd4' }" />
            <p class="empty-title">暂无 Runbook</p>
            <p class="empty-desc">Runbook 定义可复用的运维作业流程（步骤编排 + 参数 schema）</p>
            <a-button type="primary" size="small" @click="handleCreate"><template #icon><icon-plus /></template>新增 Runbook</a-button>
          </div>
        </template>
        <template #name="{ record }">
          <span class="rb-name">{{ record.name }}</span>
          <p class="rb-desc">{{ record.description || '-' }}</p>
        </template>
        <template #category="{ record }">{{ record.category || '-' }}</template>
        <template #risk_level="{ record }">
          <a-tag size="small" :color="riskLevel(record.risk_level).color">{{ riskLevel(record.risk_level).text }}</a-tag>
        </template>
        <template #version="{ record }">v{{ record.version }}</template>
        <template #is_active="{ record }">
          <a-switch :model-value="record.is_active" size="small" :loading="togglingId === record.id" @change="(v: string | number | boolean) => handleToggle(record, Boolean(v))" />
        </template>
        <template #updated_at="{ record }">{{ formatTime(record.updated_at) }}</template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" :disabled="!record.is_active" @click="openExecute(record)">
              <template #icon><icon-play-arrow /></template>执行
            </a-button>
            <a-button type="text" size="small" @click="handleEdit(record)"><template #icon><icon-edit /></template></a-button>
            <a-popconfirm content="确定删除该 Runbook？有执行历史时将拒绝删除" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑 Runbook' : '新增 Runbook'" :width="680" :ok-loading="formLoading" @ok="handleFormSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="name" label="名称"><a-input v-model="formData.name" placeholder="如：nginx 配置滚动更新" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="category" label="分类"><a-input v-model="formData.category" placeholder="如：发布 / 运维 / 应急" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="risk_level" label="风险等级">
              <a-select v-model="formData.risk_level">
                <a-option value="low">低风险</a-option>
                <a-option value="medium">中风险</a-option>
                <a-option value="high">高风险</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item field="auto_rollback" label="失败自动回滚"><a-switch v-model="formData.auto_rollback" /></a-form-item></a-col>
        </a-row>
        <a-form-item field="description" label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
        <a-form-item field="stepsText" label="步骤编排（JSON 数组，必填）">
          <a-textarea v-model="formData.stepsText" placeholder='[{"key": "deploy", "name": "部署", "type": "ansible", "playbook": "playbooks/deploy.yml", "rollbackable": true}]' :auto-size="{ minRows: 4, maxRows: 12 }" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="paramsSchemaText" label="参数 schema（JSON，可选）">
              <a-textarea v-model="formData.paramsSchemaText" placeholder='{"version": {"type": "string"}}' :auto-size="{ minRows: 2, maxRows: 8 }" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="connectionText" label="连接配置（JSON，可选，仅存钥匙名）">
              <a-textarea v-model="formData.connectionText" placeholder='{"vault_key": "ssh-prod"}' :auto-size="{ minRows: 2, maxRows: 8 }" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 执行弹窗 -->
    <ExecuteJobModal v-model:visible="executeVisible" :runbook-id="executeRunbookId" @success="onExecuted" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconRefresh, IconPlayArrow, IconCode } from '@arco-design/web-vue/es/icon'
import * as jobApi from '../../api/job'
import { riskLevel } from '../../api/job'
import type { IRunbook } from '../../api/job'
import ExecuteJobModal from './components/ExecuteJobModal.vue'

const router = useRouter()

const loading = ref(false)
const tableData = ref<IRunbook[]>([])
const queryParams = reactive({ keyword: '', category: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称', slotName: 'name', width: 240, ellipsis: true },
  { title: '分类', slotName: 'category', width: 100 },
  { title: '风险', slotName: 'risk_level', width: 90 },
  { title: '版本', slotName: 'version', width: 70 },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '更新时间', slotName: 'updated_at', width: 150 },
  { title: '操作', slotName: 'actions', width: 150 },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await jobApi.getRunbooks({
      keyword: queryParams.keyword || undefined,
      category: queryParams.category || undefined,
      page: pagination.current,
      page_size: pagination.pageSize,
    })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取 Runbook 列表失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }
function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

// ========== 启停 ==========
const togglingId = ref<number | null>(null)

async function handleToggle(record: IRunbook, isActive: boolean) {
  togglingId.value = record.id
  try {
    await jobApi.updateRunbook(record.id, { is_active: isActive })
    record.is_active = isActive
    Message.success(isActive ? '已启用' : '已下线')
  } catch { Message.error('操作失败') } finally { togglingId.value = null }
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()

const formData = reactive({
  name: '', category: '', description: '', risk_level: 'low', auto_rollback: false,
  stepsText: '', paramsSchemaText: '', connectionText: '',
})

const formRules = {
  name: [{ required: true, message: '请输入名称' }],
  stepsText: [{ required: true, message: '请编写步骤编排' }],
}

function parseJson(text: string, label: string, opts?: { array?: boolean }): Record<string, unknown>[] | Record<string, unknown> | null {
  if (!text.trim()) return opts?.array ? null : {}
  try {
    const val = JSON.parse(text)
    if (opts?.array && !Array.isArray(val)) { Message.warning(`${label}必须是 JSON 数组`); return null }
    if (!opts?.array && (Array.isArray(val) || typeof val !== 'object')) { Message.warning(`${label}必须是 JSON 对象`); return null }
    return val
  } catch {
    Message.warning(`${label}不是合法 JSON`)
    return null
  }
}

function handleCreate() {
  editingId.value = null
  Object.assign(formData, { name: '', category: '', description: '', risk_level: 'low', auto_rollback: false, stepsText: '', paramsSchemaText: '', connectionText: '' })
  formVisible.value = true
}

function handleEdit(record: IRunbook) {
  editingId.value = record.id
  Object.assign(formData, {
    name: record.name, category: record.category || '', description: record.description || '',
    risk_level: record.risk_level, auto_rollback: record.auto_rollback,
    stepsText: JSON.stringify(record.steps, null, 2),
    paramsSchemaText: Object.keys(record.params_schema).length ? JSON.stringify(record.params_schema, null, 2) : '',
    connectionText: Object.keys(record.connection).length ? JSON.stringify(record.connection, null, 2) : '',
  })
  formVisible.value = true
}

async function handleFormSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  const steps = parseJson(formData.stepsText, '步骤编排', { array: true })
  if (steps === null) return
  const paramsSchema = parseJson(formData.paramsSchemaText, '参数 schema')
  if (paramsSchema === null) return
  const connection = parseJson(formData.connectionText, '连接配置')
  if (connection === null) return

  formLoading.value = true
  try {
    if (editingId.value) {
      await jobApi.updateRunbook(editingId.value, {
        name: formData.name, category: formData.category || null, description: formData.description || null,
        risk_level: formData.risk_level, auto_rollback: formData.auto_rollback,
        steps: steps as Record<string, unknown>[],
        params_schema: paramsSchema as Record<string, unknown>,
        connection: connection as Record<string, unknown>,
      })
      Message.success('编辑成功（步骤/参数变更将版本 +1）')
    } else {
      await jobApi.createRunbook({
        name: formData.name, category: formData.category || null, description: formData.description || null,
        risk_level: formData.risk_level, auto_rollback: formData.auto_rollback,
        steps: steps as Record<string, unknown>[],
        params_schema: paramsSchema as Record<string, unknown>,
        connection: connection as Record<string, unknown>,
      })
      Message.success('新增成功')
    }
    formVisible.value = false
    fetchData()
  } catch { /* 拦截器已提示 */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await jobApi.deleteRunbook(id); Message.success('删除成功'); fetchData() } catch { /* 拦截器已提示 */ }
}

// ========== 执行 ==========
const executeVisible = ref(false)
const executeRunbookId = ref<number | undefined>()

function openExecute(record: IRunbook) {
  executeRunbookId.value = record.id
  executeVisible.value = true
}

function onExecuted(executionId: number) {
  router.push({ name: 'JobExecutionDetail', params: { id: String(executionId) } })
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.runbook-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }

.rb-name { font-weight: 500; color: $text-primary; }
.rb-desc { margin: 2px 0 0; font-size: $font-size-xs; color: $text-secondary; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 8px;
  .empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 500; color: $text-primary; }
  .empty-desc { margin: 0 0 12px; font-size: 13px; color: $text-secondary; }
}
</style>
