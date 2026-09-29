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
            <p class="empty-desc">v29 扁平单步：一个 Runbook = 一个步骤，选执行方式 + 填入口即可创建</p>
            <a-button type="primary" size="small" @click="handleCreate"><template #icon><icon-plus /></template>新增 Runbook</a-button>
          </div>
        </template>
        <template #name="{ record }">
          <span class="rb-name">{{ record.name }}</span>
          <p class="rb-entry mono">{{ record.entry }}</p>
        </template>
        <template #exec="{ record }">
          <a-space size="mini" wrap>
            <a-tag size="small" :color="execTypeMeta(record.exec_type).color">{{ execTypeMeta(record.exec_type).text }}</a-tag>
            <a-tag size="small" :color="record.run_on === 'local' ? 'green' : 'arcoblue'">{{ record.run_on === 'local' ? 'runner 本机' : '目标机' }}</a-tag>
          </a-space>
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

    <!-- 新增/编辑弹窗（v29 结构化表单：必填仅 name / exec_type / entry，其余全有安全缺省） -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑 Runbook' : '新增 Runbook'" :width="760" :ok-loading="formLoading" @ok="handleFormSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="名称" required>
              <a-input v-model="formData.name" placeholder="唯一名称，如：批量重启服务" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="分类"><a-input v-model="formData.category" placeholder="可选，如 restart" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="风险等级">
              <a-select v-model="formData.risk_level">
                <a-option v-for="(m, k) in RISK_LEVEL_MAP" :key="k" :value="k">{{ m.text }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="执行方式（exec_type）" required>
              <a-select v-model="formData.exec_type">
                <a-option v-for="t in CREATABLE_EXEC_TYPES" :key="t" :value="t">{{ execTypeMeta(t).text }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="16">
            <a-form-item :label="ENTRY_LABELS[formData.exec_type] || '入口'" required>
              <a-input v-model="formData.entry" :placeholder="ENTRY_PLACEHOLDERS[formData.exec_type]" />
            </a-form-item>
          </a-col>
        </a-row>
        <p class="form-hint">run_on（执行位置）按类型自动推断：ansible/shell → 目标机 SSH；python → runner 本机。无目标任务不需要目标机与 SSH 凭据</p>

        <!-- 连接：仅存在 target 执行时有效 -->
        <template v-if="isTargetRun">
          <a-divider orientation="left" class="sec-divider">连接配置（仅存钥匙名，真钥匙在 Vault）</a-divider>
          <a-row :gutter="16">
            <a-col :span="8"><a-form-item label="ssh_user"><a-input v-model="formData.ssh_user" placeholder="登录用户，如 ops" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="ssh_key_ref" required><a-input v-model="formData.ssh_key_ref" placeholder="Vault 键名，如 prod-node-key" /></a-form-item></a-col>
            <a-col :span="8">
              <a-form-item label="提权（become）">
                <a-space>
                  <a-switch v-model="formData.become" size="small" />
                  <span class="become-hint">{{ formData.become ? `sudo → ${formData.become_user || 'root'}` : '不提权' }}</span>
                </a-space>
              </a-form-item>
            </a-col>
          </a-row>
        </template>

        <!-- 默认执行配置（v26）：执行弹窗未填时继承 -->
        <a-divider orientation="left" class="sec-divider">默认执行配置（可选，执行时继承）</a-divider>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="默认代码版本">
              <a-input v-model="formData.default_code_ref" placeholder="git tag，如 v1.0.0" />
            </a-form-item>
          </a-col>
          <a-col :span="16">
            <a-form-item v-if="isTargetRun" label="默认目标机">
              <a-select
                v-model="formData.default_target_resource_ids"
                placeholder="输入名称/实例 ID 搜索运行中资源，可多选"
                multiple allow-clear allow-search :filter-option="false" :loading="resSearching"
                @search="searchDefaultTargets"
              >
                <a-option v-for="r in defaultTargetOptions" :key="r.id" :value="r.id">{{ r.name }}（#{{ r.id }}）</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="isTargetRun" label="目标模型白名单">
          <a-select v-model="formData.target_models" multiple allow-clear placeholder="留空 = 默认 aliyun_ecs / gcp_compute">
            <a-option v-for="m in modelOptions" :key="m.code" :value="m.code">{{ m.name }}（{{ m.code }}）</a-option>
          </a-select>
        </a-form-item>

        <!-- 参数与密钥合表：勾选「密钥」即拆进 secrets_schema（存储仍三层分离） -->
        <a-divider orientation="left" class="sec-divider">参数定义（执行时填写；明文入参 / Vault 密钥同表声明）</a-divider>
        <div class="param-table">
          <div class="param-head">
            <span class="pc pc-name">变量名</span><span class="pc pc-type">类型</span><span class="pc pc-req">必填</span>
            <span class="pc pc-def">默认值 / 默认密钥路径</span><span class="pc pc-secret">密钥</span><span class="pc pc-desc">说明</span><span class="pc pc-op"></span>
          </div>
          <div v-for="(row, idx) in paramRows" :key="idx" class="param-row">
            <a-input v-model="row.name" class="pc pc-name" placeholder="如 tables" size="small" />
            <a-select v-model="row.type" class="pc pc-type" size="small">
              <a-option value="string">string</a-option><a-option value="number">number</a-option><a-option value="boolean">boolean</a-option>
            </a-select>
            <a-checkbox v-model="row.required" class="pc pc-req" />
            <a-input v-model="row.defaultText" class="pc pc-def" size="small" :placeholder="row.secret ? 'Vault 路径如 magento2/prod#password（留空=执行者必填）' : '可选默认值'" />
            <a-checkbox v-model="row.secret" class="pc pc-secret" />
            <a-input v-model="row.description" class="pc pc-desc" size="small" placeholder="说明，执行表单展示" />
            <span class="pc pc-op"><a-button type="text" size="mini" status="danger" @click="paramRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button></span>
          </div>
          <a-button type="dashed" size="small" long @click="addParamRow"><template #icon><icon-plus /></template>添加参数</a-button>
        </div>
        <p class="form-hint">密钥列只登记 Vault 钥匙名/路径，明文永不入库；经工单执行的 Runbook 每条密钥必须预置默认路径（工单下发不带 secrets）</p>

        <a-collapse :default-active-key="[]" class="adv-collapse">
          <a-collapse-item header="高级选项（超时 / 回滚 / 灰度）" key="adv">
            <a-row :gutter="16">
              <a-col :span="6">
                <a-form-item label="超时(秒)"><a-input-number v-model="formData.timeout_sec" :min="10" size="small" style="width: 100%" /></a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="可回滚">
                  <a-switch v-model="formData.rollbackable" size="small" />
                  <span class="become-hint">{{ formData.rollbackable ? '默认，回滚重跑 undo' : '不可逆：回滚链在此任务阻断' }}</span>
                </a-form-item>
              </a-col>
              <a-col v-if="formData.exec_type === 'shell'" :span="12">
                <a-form-item label="undo_command（回滚命令）"><a-input v-model="formData.undo_command" placeholder="留空则注入 BINGOPS_ACTION=undo" size="small" /></a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="16">
              <a-col :span="6"><a-form-item label="serial 灰度批次"><a-input v-model="formData.serial" placeholder="1 / 30%，可空" size="small" /></a-form-item></a-col>
              <a-col :span="6"><a-form-item label="批间暂停(秒)"><a-input-number v-model="formData.batch_pause_sec" :min="0" size="small" style="width: 100%" /></a-form-item></a-col>
            </a-row>
            <p class="form-hint">执行位置覆盖（一般不动，按类型推断）：
              <a-radio-group v-model="formData.run_on_override" size="mini" type="button">
                <a-radio :value="false">自动推断</a-radio>
                <a-radio :value="true">{{ inferredRunOn === 'target' ? '强制 local' : '强制 target' }}</a-radio>
              </a-radio-group>
              <template v-if="formData.run_on_override">
                <a-radio-group v-model="formData.run_on" size="mini" type="button" style="margin-left: 8px">
                  <a-radio value="target">target</a-radio><a-radio value="local">local</a-radio>
                </a-radio-group>
              </template>
            </p>
          </a-collapse-item>
        </a-collapse>

        <a-form-item label="描述" class="desc-item"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 执行弹窗 -->
    <ExecuteJobModal v-model:visible="executeVisible" :runbook-id="executeRunbookId" @success="onExecuted" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconRefresh, IconPlayArrow, IconCode } from '@arco-design/web-vue/es/icon'
import * as jobApi from '../../api/job'
import { riskLevel, execTypeMeta, RISK_LEVEL_MAP, CREATABLE_EXEC_TYPES } from '../../api/job'
import type { ExecType, IRunbook, IRunbookCreate, RunOn } from '../../api/job'
import ExecuteJobModal from './components/ExecuteJobModal.vue'
import { getResourceList, getResourceOptions } from '../../api/cmdb'
import type { IResourceOption } from '../../api/cmdb'
import { getModels } from '../../api/model'
import type { IModel } from '../../types/model'

const router = useRouter()

const loading = ref(false)
const tableData = ref<IRunbook[]>([])
const queryParams = reactive({ keyword: '', category: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称 / 入口', slotName: 'name', width: 260, ellipsis: true },
  { title: '执行', slotName: 'exec', width: 150 },
  { title: '分类', slotName: 'category', width: 90 },
  { title: '风险', slotName: 'risk_level', width: 90 },
  { title: '版本', slotName: 'version', width: 60 },
  { title: '启用', slotName: 'is_active', width: 60 },
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

// entry 语义随 exec_type 变（§3.5 表驱动）
const ENTRY_LABELS: Record<string, string> = {
  ansible: 'Playbook 路径',
  shell: '命令字符串',
  python: '脚本入口（仓库内路径）',
  terraform: '工作目录',
}
const ENTRY_PLACEHOLDERS: Record<string, string> = {
  ansible: 'ansible/playbooks/app_restart.yml',
  shell: 'bash scripts/x.sh 或直接写命令',
  python: 'scripts/aliyun_create_ram_user.py',
  terraform: 'terraform/rds',
}

// exec_type → run_on 缺省推断（与后端 EXEC_TYPE_RUN_ON 同表）
function inferRunOn(t: ExecType): RunOn {
  return t === 'ansible' || t === 'shell' ? 'target' : 'local'
}

interface IParamRow {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  // 明文参数默认值 / 密钥的 default_ref（Vault 路径），按 secret 开关分流
  defaultText: string
  secret: boolean
  description: string
}

const formData = reactive({
  name: '',
  category: '',
  description: '',
  exec_type: 'ansible' as ExecType,
  entry: '',
  risk_level: 'low',
  // 连接（平铺糖字段，后端并入 connection JSONB）
  ssh_user: 'ops',
  ssh_key_ref: '',
  become: false,
  become_user: 'root',
  // 默认执行配置
  default_code_ref: '',
  default_target_resource_ids: [] as number[],
  target_models: [] as string[],
  // 高级
  timeout_sec: 600,
  rollbackable: true,
  undo_command: '',
  serial: '',
  batch_pause_sec: 0,
  run_on_override: false,
  run_on: 'target' as RunOn,
})

const paramRows = ref<IParamRow[]>([])

// 有效 run_on：override 开则手选，否则按类型推断（UI 条件渲染都走它）
const inferredRunOn = computed(() => inferRunOn(formData.exec_type))
const effectiveRunOn = computed<RunOn>(() => (formData.run_on_override ? formData.run_on : inferredRunOn.value))
const isTargetRun = computed(() => effectiveRunOn.value === 'target')

function addParamRow() {
  paramRows.value.push({ name: '', type: 'string', required: false, defaultText: '', secret: false, description: '' })
}

// 模型选项（目标模型白名单）
const modelOptions = ref<IModel[]>([])

// 默认目标机选择器：按白名单模型 + running 过滤（与执行态硬校验同规则）
const defaultTargetOptions = ref<IResourceOption[]>([])
const resSearching = ref(false)
const DEFAULT_TARGET_MODELS = ['aliyun_ecs', 'gcp_compute']

const allowedModelCodes = computed(() =>
  formData.target_models.length ? formData.target_models : DEFAULT_TARGET_MODELS,
)

async function searchDefaultTargets(keyword: string) {
  if (!isTargetRun.value) return
  resSearching.value = true
  try {
    const res = await getResourceOptions({ keyword: keyword || undefined, status: 'running', limit: 30 })
    // options 接口不按模型过滤时前端按白名单 code 收敛展示
    const items = res.data.filter(r => !r.model_code || allowedModelCodes.value.includes(r.model_code))
    const merged = [...items]
    for (const r of defaultTargetOptions.value) {
      if (formData.default_target_resource_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    defaultTargetOptions.value = merged
  } catch { /* ignore */ } finally { resSearching.value = false }
}

// 编辑回显时按 ID 拉名称补选项（否则多选只显示数字），失败退化为纯 ID 展示

function emptyForm() {
  Object.assign(formData, {
    name: '', category: '', description: '', exec_type: 'ansible', entry: '', risk_level: 'low',
    ssh_user: 'ops', ssh_key_ref: '', become: false, become_user: 'root',
    default_code_ref: '', default_target_resource_ids: [], target_models: [],
    timeout_sec: 600, rollbackable: true, undo_command: '', serial: '', batch_pause_sec: 0,
    run_on_override: false, run_on: 'target',
  })
  paramRows.value = []
  defaultTargetOptions.value = []
}

function handleCreate() {
  editingId.value = null
  emptyForm()
  formVisible.value = true
}

// 回显直读步骤列与两个 schema（后端已显式落 run_on，不再自行推断）
function handleEdit(record: IRunbook) {
  editingId.value = record.id
  const conn = record.connection || {}
  Object.assign(formData, {
    name: record.name,
    category: record.category || '',
    description: record.description || '',
    exec_type: record.exec_type,
    entry: record.entry,
    risk_level: record.risk_level,
    ssh_user: String(conn.ssh_user ?? 'ops'),
    ssh_key_ref: String(conn.ssh_key_ref ?? ''),
    become: Boolean(conn.become),
    become_user: String(conn.become_user ?? 'root'),
    default_code_ref: record.default_code_ref || '',
    default_target_resource_ids: [...(record.default_target_resource_ids || [])],
    target_models: [...(record.target_models || [])],
    timeout_sec: record.timeout_sec,
    rollbackable: record.rollbackable,
    undo_command: record.undo_command || '',
    serial: record.serial || '',
    batch_pause_sec: record.batch_pause_sec,
    run_on_override: false,
    run_on: record.run_on,
  })
  // params_schema + secrets_schema 合成一张表（存储仍是三层分离）
  const rows: IParamRow[] = []
  for (const [k, v] of Object.entries(record.params_schema || {})) {
    const spec = (v || {}) as Record<string, unknown>
    rows.push({
      name: k,
      type: (['number', 'boolean'].includes(String(spec.type)) ? String(spec.type) : 'string') as IParamRow['type'],
      required: Boolean(spec.required),
      defaultText: spec.default !== undefined && spec.default !== null ? String(spec.default) : '',
      secret: false,
      description: String(spec.description ?? ''),
    })
  }
  for (const [k, v] of Object.entries(record.secrets_schema || {})) {
    const spec = (v || {}) as Record<string, unknown>
    rows.push({
      name: k,
      type: 'string',
      required: Boolean(spec.required),
      defaultText: String(spec.default_ref ?? ''),
      secret: true,
      description: String(spec.description ?? ''),
    })
  }
  paramRows.value = rows
  // 默认目标回显：拉名称补选项（详情页数据量大时只回显前 20）
  hydrateTargetNames(formData.default_target_resource_ids)
  formVisible.value = true
}

async function hydrateTargetNames(ids: number[]) {
  if (!ids.length) return
  try {
    const results = await Promise.all(
      ids.slice(0, 20).map(id => getResourceList({ page: 1, page_size: 1, keyword: String(id) }).catch(() => null)),
    )
    const opts: IResourceOption[] = []
    results.forEach((r, i) => {
      const hit = r?.data.items?.find(x => x.id === ids[i])
      if (hit) opts.push({ id: hit.id, name: hit.name, model_code: null, provider: hit.provider, region: hit.region, status: hit.status, provider_id: hit.provider_id, labels: null })
    })
    defaultTargetOptions.value = opts
  } catch { /* ignore：回显失败退化为纯 ID 显示 */ }
}

// 提交前组装：糖字段平铺连接 + 参数合表拆回两个 schema
function buildPayload(): IRunbookCreate | null {
  const name = formData.name.trim()
  if (!name) { Message.warning('请填写名称'); return null }
  if (!formData.entry.trim()) { Message.warning(`请填写${ENTRY_LABELS[formData.exec_type] || '入口'}`); return null }
  if (isTargetRun.value && !formData.ssh_key_ref.trim() && !editingId.value) {
    // target 型必须有目标机私钥引用（后端硬校验；编辑态允许沿用原 connection）
    Message.warning('目标机任务必须填写 ssh_key_ref（Vault 钥匙名）')
    return null
  }

  const paramsSchema: Record<string, Record<string, unknown>> = {}
  const secretsSchema: Record<string, Record<string, unknown>> = {}
  const seen = new Set<string>()
  for (const row of paramRows.value) {
    const key = row.name.trim()
    if (!key) { Message.warning('参数变量名不能为空'); return null }
    if (seen.has(key)) { Message.warning(`参数变量名重复：${key}`); return null }
    seen.add(key)
    if (row.secret) {
      const spec: Record<string, unknown> = { required: row.required }
      if (row.defaultText.trim()) spec.default_ref = row.defaultText.trim()
      if (row.description.trim()) spec.description = row.description.trim()
      secretsSchema[key] = spec
    } else {
      const spec: Record<string, unknown> = { type: row.type, required: row.required }
      if (row.defaultText.trim()) {
        spec.default = row.type === 'number' ? Number(row.defaultText) : row.type === 'boolean' ? row.defaultText === 'true' : row.defaultText
      }
      if (row.description.trim()) spec.description = row.description.trim()
      paramsSchema[key] = spec
    }
  }

  const payload: IRunbookCreate = {
    name,
    exec_type: formData.exec_type,
    entry: formData.entry.trim(),
    category: formData.category.trim() || null,
    description: formData.description.trim() || null,
    risk_level: formData.risk_level,
    params_schema: paramsSchema,
    secrets_schema: secretsSchema,
    run_on: formData.run_on_override ? formData.run_on : null,
    timeout_sec: formData.timeout_sec,
    rollbackable: formData.rollbackable,
    // undo_command 仅 shell 有效，其余类型不发送（带了后端 400）
    undo_command: formData.exec_type === 'shell' && formData.undo_command.trim() ? formData.undo_command.trim() : null,
    serial: formData.serial.trim() || null,
    batch_pause_sec: formData.batch_pause_sec,
    target_models: formData.target_models.length ? [...formData.target_models] : null,
    default_target_resource_ids: isTargetRun.value ? [...formData.default_target_resource_ids] : [],
    default_code_ref: formData.default_code_ref.trim() || null,
  }
  if (isTargetRun.value) {
    // 平铺糖字段（后端并入 connection，覆盖同名键）
    payload.ssh_user = formData.ssh_user.trim() || null
    payload.ssh_key_ref = formData.ssh_key_ref.trim() || null
    payload.become = formData.become
    payload.become_user = formData.become ? (formData.become_user.trim() || 'root') : null
  } else {
    // local 型清空连接糖字段前需显式送 connection 覆盖旧值（编辑 ansible→python 场景）
    payload.connection = {}
  }
  return payload
}

async function handleFormSubmit() {
  const payload = buildPayload()
  if (!payload) return
  formLoading.value = true
  try {
    if (editingId.value) {
      await jobApi.updateRunbook(editingId.value, payload)
      Message.success('编辑成功（定义变更将版本 +1）')
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

onMounted(async () => {
  fetchData()
  try { modelOptions.value = (await getModels()).data } catch { /* ignore */ }
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.runbook-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }

.rb-name { font-weight: 500; color: $text-primary; }
.rb-entry { margin: 2px 0 0; font-size: $font-size-xs; color: $text-secondary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono { font-family: $font-mono; }

.form-hint { margin: -8px 0 $spacing-sm; font-size: $font-size-xs; color: $text-secondary; }
.sec-divider { margin: $spacing-xs 0 $spacing-sm; font-size: $font-size-sm; color: $text-secondary; }
.become-hint { font-size: $font-size-xs; color: $text-secondary; }

// 参数合表：与拓扑/流水线行编辑一致的网格布局
.param-table { margin-bottom: $spacing-sm; }
.param-head, .param-row { display: flex; align-items: center; gap: 6px; }
.param-head { font-size: $font-size-xs; color: $text-secondary; margin-bottom: 4px; }
.param-row { margin-bottom: 6px; }
.pc-name { flex: 0 0 120px; }
.pc-type { flex: 0 0 90px; }
.pc-req { flex: 0 0 40px; text-align: center; }
.pc-def { flex: 1; min-width: 0; }
.pc-secret { flex: 0 0 40px; text-align: center; }
.pc-desc { flex: 0 0 180px; }
.pc-op { flex: 0 0 40px; text-align: center; }

.adv-collapse { margin-bottom: $spacing-sm; :deep(.arco-collapse-item-header) { font-size: $font-size-sm; color: $text-secondary; } }
.desc-item { margin-top: $spacing-sm; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 8px;
  .empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 500; color: $text-primary; }
  .empty-desc { margin: 0 0 12px; font-size: 13px; color: $text-secondary; }
}
</style>
