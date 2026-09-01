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
        <template #target_models="{ record }">
          <a-space wrap size="mini" v-if="(record.target_models || []).length">
            <a-tag v-for="code in record.target_models" :key="code" size="small">{{ code }}</a-tag>
          </a-space>
          <span v-else class="default-models">默认 ecs / compute</span>
        </template>
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
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑 Runbook' : '新增 Runbook'" :width="860" :ok-loading="formLoading" @ok="handleFormSubmit">
      <a-form :model="formData" layout="vertical">
        <a-form-item field="description" label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
        <a-form-item field="docYaml" label="Runbook 定义（YAML 单文档）">
          <YamlEditor v-model="formData.docYaml" height="480px" />
          <template #extra>
            <span class="yaml-tip">字段：name* / category / target_models / risk_level(low|medium|high|critical) / auto_rollback / connection / params_schema / steps*（支持 timeout_sec / serial / batch_pause_sec / rollbackable）；存储与 API 契约仍为 JSON，提交时自动转换；connection 仅存钥匙名，真钥匙在 Vault</span>
          </template>
        </a-form-item>
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
import YamlEditor from '../../components/YamlEditor.vue'
import { parseYaml, dumpYaml } from '../../utils/yaml'

const router = useRouter()

const loading = ref(false)
const tableData = ref<IRunbook[]>([])
const queryParams = reactive({ keyword: '', category: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称', slotName: 'name', width: 240, ellipsis: true },
  { title: '分类', slotName: 'category', width: 100 },
  { title: '目标模型', slotName: 'target_models', width: 160 },
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

const formData = reactive({ description: '', docYaml: '' })

// v20 单文档格式：标量字段也进 YAML（与 GitLab runbook-as-code 同构）；connection 凭据键除外
const RISK_LEVELS = ['low', 'medium', 'high', 'critical']

// 新建预填模板（含注释，YAML 注释是 runbook-as-code 的重要载体）
const NEW_RUNBOOK_TEMPLATE = `name: 批量重启服务
category: restart
target_models: [aliyun_ecs, gcp_compute]  # 目标范围硬校验；P1 默认即此两类
risk_level: medium            # low/medium/high/critical，叠加环境维度提级（P3）
auto_rollback: false          # opt-in 自动回滚，默认手动
connection:                   # runner 据此渲染 inventory 变量；仅钥匙名，真钥匙在 Vault
  ssh_user: ops               # 登录用户（非 root）
  ssh_key_ref: prod-node-key  # Vault 键名
  become: true                # 默认 false，需提权显式开
  become_method: sudo
  become_user: root
params_schema:                # 条目 spec：type/required/default/enum/description
  svc: {type: string, required: true, description: 服务名}
  retries: {type: number, default: 1}   # default 下发时后端自动回填，表单只收用户填写项
steps:
  - key: restart_app
    name: 重启服务
    type: ansible             # P1 仅 ansible；terraform 枚举占位 P2 点亮
    playbook: ansible/playbooks/app_restart.yml
    timeout_sec: 600
    serial: "30%"             # 灰度批次
    batch_pause_sec: 60       # 批间暂停
    rollbackable: true        # 引擎回滚 = 同 playbook 重发 + bingops_action=undo
  - key: run_migration
    type: ansible
    playbook: ansible/playbooks/db_migrate.yml
    rollbackable: false       # 不可逆步骤：UI 启动前高亮，回滚链不穿过它
`

// 解析并校验单文档（UX 层；权威仍是后端 400）
function loadDoc(): Record<string, unknown> | null {
  const res = parseYaml<Record<string, unknown>>(formData.docYaml)
  if (!res.ok) { Message.warning(`YAML 语法错误：${res.error}`); return null }
  const doc = res.data
  if (!doc || Array.isArray(doc) || typeof doc !== 'object') { Message.warning('Runbook 定义必须是 YAML 映射'); return null }
  if (typeof doc.name !== 'string' || !doc.name.trim()) { Message.warning('缺少必填字段：name'); return null }
  if (!Array.isArray(doc.steps) || !doc.steps.length) { Message.warning('缺少必填字段：steps（非空列表）'); return null }
  const risk = String(doc.risk_level ?? 'low')
  if (!RISK_LEVELS.includes(risk)) { Message.warning('risk_level 必须是 low / medium / high / critical'); return null }
  if (doc.connection !== undefined && (typeof doc.connection !== 'object' || Array.isArray(doc.connection) || doc.connection === null)) { Message.warning('connection 必须是键值映射'); return null }
  return doc
}

// 回显：按示例字段序组装整文档（dump 保插入序，往返无 diff 噪音）
function buildDocYaml(record: IRunbook): string {
  const doc: Record<string, unknown> = { name: record.name }
  if (record.category) doc.category = record.category
  if ((record.target_models || []).length) doc.target_models = record.target_models
  doc.risk_level = record.risk_level
  doc.auto_rollback = record.auto_rollback
  if (Object.keys(record.connection || {}).length) doc.connection = record.connection
  if (Object.keys(record.params_schema).length) doc.params_schema = record.params_schema
  doc.steps = record.steps
  return dumpYaml(doc)
}

function handleCreate() {
  editingId.value = null
  Object.assign(formData, { description: '', docYaml: NEW_RUNBOOK_TEMPLATE })
  formVisible.value = true
}

function handleEdit(record: IRunbook) {
  editingId.value = record.id
  Object.assign(formData, {
    description: record.description || '',
    docYaml: buildDocYaml(record),
  })
  formVisible.value = true
}

async function handleFormSubmit() {
  const doc = loadDoc()
  if (doc === null) return

  formLoading.value = true
  try {
    const payload = {
      name: String(doc.name).trim(),
      category: typeof doc.category === 'string' && doc.category.trim() ? doc.category.trim() : null,
      description: formData.description || null,
      risk_level: String(doc.risk_level ?? 'low'),
      auto_rollback: doc.auto_rollback === true,
      target_models: Array.isArray(doc.target_models) && doc.target_models.length ? (doc.target_models as string[]) : null,
      connection: (doc.connection && typeof doc.connection === 'object' && !Array.isArray(doc.connection)
        ? doc.connection
        : {}) as Record<string, unknown>,
      params_schema: (doc.params_schema && typeof doc.params_schema === 'object' && !Array.isArray(doc.params_schema)
        ? doc.params_schema
        : {}) as Record<string, unknown>,
      steps: doc.steps as Record<string, unknown>[],
    }
    if (editingId.value) {
      await jobApi.updateRunbook(editingId.value, payload)
      Message.success('编辑成功（步骤/参数变更将版本 +1）')
    } else {
      await jobApi.createRunbook(payload)
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

// 模型选项（目标模型白名单下拉用）——已随结构化表单移除

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.runbook-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }

.rb-name { font-weight: 500; color: $text-primary; }
.rb-desc { margin: 2px 0 0; font-size: $font-size-xs; color: $text-secondary; }
.default-models { font-size: $font-size-xs; color: $text-secondary; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 8px;
  .empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 500; color: $text-primary; }
  .empty-desc { margin: 0 0 12px; font-size: 13px; color: $text-secondary; }
}

.yaml-tip { font-size: $font-size-xs; color: $text-secondary; }
</style>
