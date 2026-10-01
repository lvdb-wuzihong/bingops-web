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
            <p class="empty-desc">一个 Runbook = 一个步骤，选执行方式 + 填入口即可创建</p>
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
            <a-tag size="small" :color="record.run_on === 'local' ? 'green' : 'arcoblue'">{{ record.run_on === 'local' ? '执行机本机' : '目标机' }}</a-tag>
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

    <!-- 新增/编辑弹窗：2 步向导，runbook 只定「怎么跑/怎么连/参数」，具体目标执行时选 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑 Runbook' : '新增 Runbook'" :width="720">
      <a-steps :current="current + 1" size="small" class="rb-steps">
        <a-step v-for="s in stepDefs" :key="s.key" :title="s.title" />
      </a-steps>
      <a-form :model="formData" layout="vertical" class="rb-form">
        <!-- 步骤一：名称 + 怎么跑 -->
        <template v-if="stepKey === 'basic'">
        <a-form-item label="名称" required>
          <a-input v-model="formData.name" placeholder="如：清理测试机磁盘" />
        </a-form-item>

        <!-- ① 怎么跑 -->
        <div class="sec-title"><icon-question-circle /> 怎么跑</div>
        <div class="exec-cards">
          <div
            v-for="opt in EXEC_CARDS" :key="opt.value"
            class="exec-card" :class="{ active: formData.exec_type === opt.value, disabled: opt.disabled }"
            @click="selectExec(opt)"
          >
            <div class="exec-card-title">{{ opt.title }}</div>
            <div class="exec-card-desc">{{ opt.desc }}</div>
          </div>
        </div>
        <a-form-item :label="entryMeta.label" required>
          <a-input v-model="formData.entry" :placeholder="entryMeta.placeholder" />
          <template #extra><span class="hint">{{ entryMeta.hint }}</span></template>
        </a-form-item>
        <!-- v31：凭据属于机器不属于任务——目标机与登录凭据执行期逐台解析，runbook 不指定 -->
        <p v-if="isTargetRun" class="local-note"><icon-check-circle-fill class="ok-ic" /> 目标机与登录凭据在执行时按主机标签 / 凭据目录逐台解析，runbook 无需指定；如需任务级兜底钥匙见「高级设置」</p>
        <p v-else class="local-note"><icon-check-circle-fill class="ok-ic" /> 该类型由平台执行机本机运行，无需登录凭据；执行目标在「执行」时圈选</p>
        </template>

        <!-- 步骤二：参数 + 高级设置 -->
        <template v-else>
        <div class="sec-title"><icon-schedule /> 每次执行要变什么</div>
        <div class="param-table">
          <div class="param-head">
            <span class="pc pc-name">变量名</span><span class="pc pc-type">类型</span>
            <span class="pc pc-def">默认值</span><span class="pc pc-desc">说明</span>
            <span class="pc pc-req">必填</span><span class="pc pc-op"></span>
          </div>
          <div v-for="(row, idx) in paramRows" :key="idx" class="param-row">
            <a-input v-model="row.name" class="pc pc-name" placeholder="如 tables" size="small" />
            <a-select v-model="row.type" class="pc pc-type" size="small">
              <a-option value="string">字符串</a-option>
              <a-option value="number">数字</a-option>
              <a-option value="boolean">布尔</a-option>
              <a-option value="secret">密钥引用</a-option>
            </a-select>
            <a-input
              v-model="row.defaultText" class="pc pc-def" size="small"
              :placeholder="row.type === 'secret' ? 'Vault 路径，如 magento2/prod/readonly#password' : '默认值 / Vault 路径'"
            />
            <a-input v-model="row.description" class="pc pc-desc" size="small" placeholder="执行表单上的提示" />
            <a-checkbox v-model="row.required" class="pc pc-req" />
            <span class="pc pc-op"><a-button type="text" size="mini" status="danger" @click="paramRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button></span>
          </div>
          <a-button type="dashed" size="small" long @click="addParamRow"><template #icon><icon-plus /></template>添加一项</a-button>
        </div>
        <p class="hint param-hint">类型选「密钥引用」时，默认值填 Vault 路径（如 <code>magento2/prod/readonly#password</code>），执行时不写明文</p>

        <!-- 高级设置：元数据与灰度下沉，自控展开（图标与文字分离，避免折叠头箭头压字） -->
        <div class="adv-toggle" @click="advOpen = !advOpen">
          <icon-right class="adv-chev" :class="{ open: advOpen }" />
          <span class="adv-label">高级设置</span>
          <span class="adv-sub">默认值已可用，一般不用动</span>
        </div>
        <div v-show="advOpen" class="adv-body">
          <a-row :gutter="16">
            <a-col :span="8"><a-form-item label="风险等级"><a-select v-model="formData.risk_level"><a-option v-for="(m, k) in RISK_LEVEL_MAP" :key="k" :value="k">{{ m.text }}</a-option></a-select></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="分类"><a-input v-model="formData.category" placeholder="如 restart" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="默认代码版本"><a-input v-model="formData.default_code_ref" placeholder="git tag，如 v1.0.0" /></a-form-item></a-col>
          </a-row>
          <a-form-item v-if="isTargetRun" label="允许的目标模型">
            <a-select v-model="formData.target_models" multiple allow-clear placeholder="留空 = 默认 aliyun_ecs / gcp_compute">
              <a-option v-for="m in modelOptions" :key="m.code" :value="m.code">{{ m.name }}（{{ m.code }}）</a-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="isTargetRun" label="默认目标机（可选，执行时可覆盖）">
            <a-select
              v-model="formData.default_target_resource_ids"
              placeholder="留空即可；设定后执行弹窗会预选这几台"
              multiple allow-clear allow-search :filter-option="false" :loading="resSearching"
              @search="searchDefaultTargets" @visible-change="onDefaultTargetOpen"
            >
              <a-option v-for="r in defaultTargetOptions" :key="r.id" :value="r.id">{{ r.name }}（{{ r.provider_id || '#' + r.id }}）</a-option>
            </a-select>
          </a-form-item>
          <!-- v31：任务级兜底（可选）——仅当目标机无 ssh_credential 标签且凭据目录无默认时才需要 -->
          <a-row v-if="isTargetRun" :gutter="16">
            <a-col :span="12"><a-form-item label="兜底登录用户"><a-input v-model="formData.ssh_user" placeholder="可空，如 ops" size="small" /></a-form-item></a-col>
            <a-col :span="12"><a-form-item label="兜底登录密钥"><a-input v-model="formData.ssh_key_ref" placeholder="可空；主机无标签且目录无默认时才填" size="small" /></a-form-item></a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="6"><a-form-item label="超时(秒)"><a-input-number v-model="formData.timeout_sec" :min="10" size="small" style="width: 100%" /></a-form-item></a-col>
            <a-col :span="6">
              <a-form-item label="可回滚">
                <a-switch v-model="formData.rollbackable" size="small" />
                <span class="hint" style="margin-left: 6px">{{ formData.rollbackable ? '回滚重跑 undo' : '不可逆' }}</span>
              </a-form-item>
            </a-col>
            <a-col :span="12"><a-form-item label="提权（become）"><a-switch v-model="formData.become" size="small" /><span class="hint" style="margin-left: 6px">{{ formData.become ? `sudo → ${formData.become_user || 'root'}` : '不提权' }}</span></a-form-item></a-col>
          </a-row>
          <a-form-item label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
        </div>
        </template>
      </a-form>

      <template #footer>
        <a-space>
          <a-button @click="formVisible = false">取消</a-button>
          <a-button v-if="current > 0" @click="prevStep">上一步</a-button>
          <a-button v-if="current < stepDefs.length - 1" type="primary" @click="nextStep">下一步</a-button>
          <a-button v-else type="primary" :loading="formLoading" @click="handleFormSubmit">确定</a-button>
        </a-space>
      </template>
    </a-modal>

    <!-- 执行弹窗 -->
    <ExecuteJobModal v-model:visible="executeVisible" :runbook-id="executeRunbookId" @success="onExecuted" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import {
  IconPlus, IconEdit, IconDelete, IconRefresh, IconPlayArrow, IconCode,
  IconQuestionCircle, IconSchedule, IconCheckCircleFill, IconRight,
} from '@arco-design/web-vue/es/icon'
import * as jobApi from '../../api/job'
import { riskLevel, execTypeMeta, RISK_LEVEL_MAP } from '../../api/job'
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

// 执行方式卡片：中文语义优先，terraform 门控未开置灰不可选
const EXEC_CARDS: { value: ExecType; title: string; desc: string; disabled?: boolean }[] = [
  { value: 'shell', title: '跑一条命令', desc: 'SSH 到目标机执行' },
  { value: 'ansible', title: '跑 Playbook', desc: 'SSH 到目标机执行' },
  { value: 'python', title: '跑 Python 脚本', desc: '平台执行机本机跑' },
  { value: 'terraform', title: '跑 Terraform', desc: '暂未开放', disabled: true },
]

// 入口标签/占位/提示随类型变（不再用固定的“命令字符串”误导）
const ENTRY_META: Record<ExecType, { label: string; placeholder: string; hint: string }> = {
  shell: { label: '命令', placeholder: 'bash scripts/x.sh 或直接写命令', hint: '在目标机上执行的 shell 命令；跑仓库里的脚本写 bash scripts/x.sh' },
  ansible: { label: 'Playbook 路径', placeholder: 'ansible/playbooks/app_restart.yml', hint: 'GitLab 仓库内的 playbook 相对路径' },
  python: { label: '脚本入口', placeholder: 'scripts/aliyun_create_ram_user.py', hint: '仓库内脚本，由平台执行机本机运行' },
  terraform: { label: '工作目录', placeholder: 'terraform/rds', hint: '暂未开放' },
}

// exec_type → run_on 推断（与后端 EXEC_TYPE_RUN_ON 同表，界面不再暴露 run_on）
function inferRunOn(t: ExecType): RunOn {
  return t === 'ansible' || t === 'shell' ? 'target' : 'local'
}

function selectExec(opt: { value: ExecType; disabled?: boolean }) {
  if (opt.disabled) { Message.info('Terraform 执行暂未开放'); return }
  formData.exec_type = opt.value
}

// 参数行：类型含「密钥引用」，勾选即拆进 secrets_schema（存储仍三层分离）
interface IParamRow {
  name: string
  type: 'string' | 'number' | 'boolean' | 'secret'
  required: boolean
  // 明文参数默认值 / 密钥的 Vault 路径
  defaultText: string
  description: string
}

const formData = reactive({
  name: '',
  category: '',
  description: '',
  exec_type: 'shell' as ExecType,
  entry: '',
  risk_level: 'low',
  ssh_user: 'root',
  ssh_key_ref: '',
  become: false,
  become_user: 'root',
  default_code_ref: '',
  default_target_resource_ids: [] as number[],
  target_models: [] as string[],
  timeout_sec: 600,
  rollbackable: true,
})

const paramRows = ref<IParamRow[]>([])

const entryMeta = computed(() => ENTRY_META[formData.exec_type])
const isTargetRun = computed(() => inferRunOn(formData.exec_type) === 'target')

// ========== 分步向导：runbook 只定「怎么跑/怎么连」，具体目标执行时选 ==========
const current = ref(0)
// 高级设置自控展开（每次打开弹窗重置为收起）
const advOpen = ref(false)
const stepDefs = computed(() => [
  { key: 'basic', title: '怎么跑' },
  { key: 'params', title: '参数与高级' },
])
const stepKey = computed(() => stepDefs.value[current.value]?.key ?? 'basic')

// 前进前校验当前步（权威校验仍在 buildPayload/后端 400）
function validateStep(key: string): boolean {
  if (key === 'basic') {
    if (!formData.name.trim()) { Message.warning('请填写名称'); return false }
    if (!formData.entry.trim()) { Message.warning(`请填写${entryMeta.value.label}`); return false }
    // v31：登录凭据属于机器（执行期逐台解析），runbook 不再要求 ssh_key_ref
  }
  return true
}
function nextStep() {
  if (!validateStep(stepKey.value)) return
  if (current.value < stepDefs.value.length - 1) current.value++
}
function prevStep() { if (current.value > 0) current.value-- }

function addParamRow() {
  paramRows.value.push({ name: '', type: 'string', required: false, defaultText: '', description: '' })
}

// 模型选项（允许的目标模型）
const modelOptions = ref<IModel[]>([])

// 目标主机选择器：running + 白名单模型过滤（与执行态硬校验同规则）
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
    const items = res.data.filter(r => !r.model_code || allowedModelCodes.value.includes(r.model_code))
    const merged = [...items]
    for (const r of defaultTargetOptions.value) {
      if (formData.default_target_resource_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    defaultTargetOptions.value = merged
  } catch { /* ignore */ } finally { resSearching.value = false }
}

// 下拉展开时预加载一次（修复打开即空、需先输入才出选项的「选不到」）
function onDefaultTargetOpen(v: boolean) {
  if (v && defaultTargetOptions.value.length === 0) searchDefaultTargets('')
}

function emptyForm() {
  Object.assign(formData, {
    name: '', category: '', description: '', exec_type: 'shell', entry: '', risk_level: 'low',
    ssh_user: 'root', ssh_key_ref: '', become: false, become_user: 'root',
    default_code_ref: '', default_target_resource_ids: [], target_models: [],
    timeout_sec: 600, rollbackable: true,
  })
  paramRows.value = []
  defaultTargetOptions.value = []
  current.value = 0
  advOpen.value = false
}

function handleCreate() {
  editingId.value = null
  emptyForm()
  formVisible.value = true
}

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
    ssh_user: String(conn.ssh_user ?? 'root'),
    ssh_key_ref: String(conn.ssh_key_ref ?? ''),
    become: Boolean(conn.become),
    become_user: String(conn.become_user ?? 'root'),
    default_code_ref: record.default_code_ref || '',
    default_target_resource_ids: [...(record.default_target_resource_ids || [])],
    target_models: [...(record.target_models || [])],
    timeout_sec: record.timeout_sec,
    rollbackable: record.rollbackable,
  })
  // params_schema + secrets_schema 合成一张表（密钥条目类型置为 secret）
  const rows: IParamRow[] = []
  for (const [k, v] of Object.entries(record.params_schema || {})) {
    const spec = (v || {}) as Record<string, unknown>
    rows.push({
      name: k,
      type: (['number', 'boolean'].includes(String(spec.type)) ? String(spec.type) : 'string') as IParamRow['type'],
      required: Boolean(spec.required),
      defaultText: spec.default !== undefined && spec.default !== null ? String(spec.default) : '',
      description: String(spec.description ?? ''),
    })
  }
  for (const [k, v] of Object.entries(record.secrets_schema || {})) {
    const spec = (v || {}) as Record<string, unknown>
    rows.push({
      name: k, type: 'secret', required: Boolean(spec.required),
      defaultText: String(spec.default_ref ?? ''), description: String(spec.description ?? ''),
    })
  }
  paramRows.value = rows
  hydrateTargetNames(formData.default_target_resource_ids)
  current.value = 0
  advOpen.value = false
  formVisible.value = true
}

// 编辑回显按 ID 拉名称补选项，失败退化为纯 ID 展示
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
  } catch { /* ignore */ }
}

function buildPayload(): IRunbookCreate | null {
  const name = formData.name.trim()
  if (!name) { Message.warning('请填写名称'); return null }
  if (!formData.entry.trim()) { Message.warning(`请填写${entryMeta.value.label}`); return null }
  if (isTargetRun.value && !formData.ssh_key_ref.trim() && !editingId.value) {
    Message.warning('目标机任务必须填写登录密钥')
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
    if (row.type === 'secret') {
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

  const runOn = inferRunOn(formData.exec_type)
  const payload: IRunbookCreate = {
    name,
    exec_type: formData.exec_type,
    entry: formData.entry.trim(),
    category: formData.category.trim() || null,
    description: formData.description.trim() || null,
    risk_level: formData.risk_level,
    params_schema: paramsSchema,
    secrets_schema: secretsSchema,
    // 显式落推断后的 run_on（与后端一致；编辑改类型时同步刷新）
    run_on: runOn,
    timeout_sec: formData.timeout_sec,
    rollbackable: formData.rollbackable,
    target_models: formData.target_models.length ? [...formData.target_models] : null,
    default_target_resource_ids: isTargetRun.value ? [...formData.default_target_resource_ids] : [],
    default_code_ref: formData.default_code_ref.trim() || null,
  }
  if (isTargetRun.value) {
    payload.ssh_user = formData.ssh_user.trim() || null
    payload.ssh_key_ref = formData.ssh_key_ref.trim() || null
    payload.become = formData.become
    payload.become_user = formData.become ? (formData.become_user.trim() || 'root') : null
  } else {
    // local 型显式清空 connection（编辑 ansible→python 时移除旧凭据）
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
.rb-entry { margin: 2px 0 0; font-size: $font-size-xs; color: $text-hint; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono { font-family: $font-mono; }

// 提示文字统一中性灰：$text-secondary 在本主题里是饱和蓝，只用于强调，不能做弱化说明
.hint { font-size: $font-size-xs; color: $text-hint; line-height: 1.5; }
:deep(.arco-form-item-extra) { color: $text-hint; }

.rb-form { :deep(.arco-form-item) { margin-bottom: $spacing-sm; } }

.rb-steps { margin-bottom: $spacing-lg; :deep(.arco-steps-item-title) { font-size: $font-size-sm; } }

// 分区标题：① 怎么跑 / ② 在哪跑 / ③ 每次执行要变什么
.sec-title {
  display: flex; align-items: center; gap: 6px;
  margin: $spacing-md 0 $spacing-sm; padding-bottom: 6px;
  font-size: $font-size-sm; font-weight: 600; color: $text-primary;
  border-bottom: 1px solid $border-color-light;
  :deep(svg) { color: $color-primary; }
}
.sec-title:first-of-type { margin-top: $spacing-xs; }

// 执行方式卡片
.exec-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: $spacing-sm; margin-bottom: $spacing-md; }
.exec-card {
  padding: $spacing-sm 10px; border: 1px solid $border-color; border-radius: $radius-md;
  cursor: pointer; background: $bg-secondary; transition: all 0.15s;
  .exec-card-title { font-size: $font-size-sm; font-weight: 600; color: $text-body; }
  .exec-card-desc { margin-top: 2px; font-size: $font-size-xs; color: $text-hint; }
  &:hover { border-color: $color-primary-light; }
  &.active { border-color: $color-primary; background: rgba(22, 119, 255, 0.06); box-shadow: 0 0 0 1px $color-primary inset; .exec-card-title { color: $color-primary; } }
  &.disabled { opacity: 0.5; cursor: not-allowed; }
}

// Python 本机执行说明
.local-note { display: flex; align-items: center; gap: 6px; margin: 0 0 $spacing-sm; font-size: $font-size-sm; color: $text-body; }
.ok-ic { color: $color-success; }

// 参数合表：固定列 + 两个自适应列用 grid，避免 flex:1 在窄弹窗下把「默认值」列压成零宽
.param-table { margin-bottom: $spacing-xs; }
.param-head, .param-row {
  display: grid; grid-template-columns: 120px 100px minmax(0, 1fr) minmax(0, 1fr) 40px 32px;
  gap: 6px; align-items: center;
}
.param-head { font-size: $font-size-xs; color: $text-hint; margin-bottom: 4px; }
.param-row { margin-bottom: 6px; }
.pc-req, .pc-op { justify-self: center; }
.param-hint { margin: 4px 0 0; code { font-family: $font-mono; background: rgba(22, 119, 255, 0.06); padding: 0 4px; border-radius: 3px; } }

// 高级设置：自控展开，图标与文字分离、箭头随展开旋转
.adv-toggle {
  display: flex; align-items: center; gap: 6px; margin-top: $spacing-md;
  padding: 7px 12px; border-radius: $radius-sm; cursor: pointer;
  background: rgba(22, 119, 255, 0.04); border: 1px solid $border-color-light;
  .adv-chev { font-size: 12px; color: $text-hint; transition: transform 0.2s; flex-shrink: 0; }
  .adv-chev.open { transform: rotate(90deg); }
  .adv-label { font-size: $font-size-sm; font-weight: 500; color: $text-body; }
  .adv-sub { font-size: $font-size-xs; color: $text-hint; }
  &:hover { background: rgba(22, 119, 255, 0.07); }
}
.adv-body { padding-top: $spacing-sm; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 8px;
  .empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 500; color: $text-primary; }
  .empty-desc { margin: 0 0 12px; font-size: 13px; color: $text-hint; }
}
</style>
