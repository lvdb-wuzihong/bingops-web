<template>
  <a-modal v-model:visible="visibleProxy" title="执行 Runbook" :width="600" :ok-loading="loading" @ok="handleSubmit">
    <a-form :model="formData" layout="vertical" ref="formRef">
      <a-form-item field="runbook_id" label="Runbook" :rules="[{ required: true, message: '请选择 Runbook' }]">
        <a-select v-model="formData.runbook_id" placeholder="请选择" :disabled="!!props.runbookId" allow-search @change="onRunbookChange">
          <a-option v-for="rb in runbookOptions" :key="rb.id" :value="rb.id" :disabled="!rb.is_active">
            {{ rb.name }}（v{{ rb.version }}）
          </a-option>
        </a-select>
      </a-form-item>

      <template v-if="selectedRunbook">
        <!-- 执行方式概览：让执行者先知道这是打哪的任务 -->
        <p class="rb-meta">
          <a-tag size="small" :color="execTypeMeta(selectedRunbook.exec_type).color">{{ execTypeMeta(selectedRunbook.exec_type).text }}</a-tag>
          <a-tag size="small" :color="isLocal ? 'green' : 'arcoblue'">{{ isLocal ? 'runner 本机执行，无需目标机' : 'SSH 目标机执行' }}</a-tag>
          <span class="rb-entry mono">{{ selectedRunbook.entry }}</span>
        </p>

        <!-- v36：目标机与版本已从 runbook 幕落，每次执行都要选；可从本 Runbook 上次执行带入 -->
        <div class="reuse-bar">
          <a-button size="mini" :loading="reuseLoading" @click="reuseLast">复用上次的目标与版本</a-button>
          <span class="rb-entry">目标机/代码版本每次执行都要选，v36 起不再缓存在模板上</span>
        </div>

        <a-form-item v-if="needsCodeRef" field="code_ref" label="代码版本（git tag）" :extra="codeRefHint">
          <a-input v-model="formData.code_ref" placeholder="如：v1.0.0" />
        </a-form-item>

        <a-form-item v-if="!isLocal" field="target_ids" label="目标资源" required :extra="targetHint">
          <a-select
            v-model="formData.target_ids"
            multiple allow-search :filter-option="false" :loading="resSearching"
            placeholder="输入名称/实例 ID 搜索，可多选（每次执行都要选）"
            @search="searchResources"
          >
            <a-option v-for="r in resourceOptions" :key="r.id" :value="r.id">{{ r.name }}（{{ r.model_code || '-' }} · #{{ r.id }}）</a-option>
          </a-select>
        </a-form-item>

        <!-- v34 连接三件套：以谁的身份连、用哪把钥匙、走哪条路——执行时才确定，仅目标机型 -->
        <template v-if="!isLocal">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="登录用户">
                <a-input v-model="formData.ssh_user" placeholder="如 ops / root" />
                <template #extra><span class="rb-entry">留空则回落主机标签 ssh_user / runbook 存量</span></template>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="SSH 钥匙">
                <a-select v-model="formData.ssh_credential" placeholder="从凭据目录选（kind=ssh_key）" allow-clear allow-search>
                  <a-option v-for="c in sshCredentials" :key="c.id" :value="c.name">{{ c.name }}</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="提权（become）">
                <a-switch v-model="formData.become" size="small" />
                <span class="rb-entry" style="margin-left: 6px">{{ formData.become ? 'sudo 提权' : '不提权' }}</span>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="中转网关（可选）">
                <a-select v-model="formData.gateway_name" placeholder="留空 = 按机器归属自动选路" allow-clear>
                  <a-option v-for="g in gateways" :key="g.id" :value="g.name">{{ g.name }}（{{ g.host }}）</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
        </template>

        <!-- 参数动态表单：按 params_schema 逐条渲染（default 后端回填，只收集实际填写值） -->
        <template v-for="(spec, key) in paramsSchema" :key="String(key)">
          <a-form-item :label="`${String(key)}${spec.description ? ' · ' + spec.description : ''}`" :required="!!spec.required">
            <a-select
              v-if="Array.isArray(spec.enum)"
              :model-value="(paramValues[String(key)] as string | number | boolean | undefined)"
              placeholder="请选择" allow-clear
              @update:model-value="(v: unknown) => (paramValues[String(key)] = v as string | number | boolean | undefined)"
            >
              <a-option v-for="e in spec.enum" :key="String(e)" :value="e">{{ String(e) }}</a-option>
            </a-select>
            <a-switch
              v-else-if="spec.type === 'boolean'"
              :model-value="Boolean(paramValues[String(key)])"
              @update:model-value="(v: string | number | boolean) => (paramValues[String(key)] = Boolean(v))"
            />
            <a-input-number
              v-else-if="spec.type === 'number'"
              :model-value="(paramValues[String(key)] as number | undefined)"
              :placeholder="spec.default !== undefined ? `默认 ${spec.default}` : ''"
              style="width: 100%"
              @update:model-value="(v: number | undefined) => (paramValues[String(key)] = v)"
            />
            <a-input
              v-else
              :model-value="(paramValues[String(key)] as string | undefined)"
              :placeholder="spec.default !== undefined ? `默认 ${spec.default}` : (spec.required ? '必填' : '可选')"
              @update:model-value="(v: string) => (paramValues[String(key)] = v || undefined)"
            />
          </a-form-item>
        </template>

        <!-- 密钥入参（v27 凭据三层）：只填 Vault 钥匙名/路径，明文不经浏览器 -->
        <template v-for="(spec, key) in secretsSchema" :key="String(key)">
          <a-form-item :label="`密钥 ${String(key)}${spec.description ? ' · ' + spec.description : ''}`" :required="!!spec.required && !spec.default_ref">
            <a-input
              v-model="secretValues[String(key)]"
              :placeholder="spec.default_ref ? `留空 = 用默认 ${spec.default_ref}` : (spec.required ? '凭据名称或 Vault 路径，必填' : '凭据名称或 Vault 路径，可选')"
            />
          </a-form-item>
        </template>
        <p v-if="Object.keys(secretsSchema).length" class="secrets-hint">值可填凭据目录中的名称（平台展开为 Vault 路径）或裸 Vault 路径；条目声明了类型时强制走目录并校验，拼错/拿错类型创建执行即 400</p>
        <p v-if="!Object.keys(paramsSchema).length && !Object.keys(secretsSchema).length" class="no-params">该 Runbook 无需填参，直接执行</p>
      </template>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import * as jobApi from '../../../api/job'
import { execTypeMeta } from '../../../api/job'
import { getResourceList } from '../../../api/cmdb'
import type { ICmdbResource } from '../../../api/cmdb'
import { getModels } from '../../../api/model'
import { getCredentials } from '../../../api/credential'
import type { ICredential } from '../../../api/credential'
import { getGateways } from '../../../api/gateway'
import type { IJobGateway } from '../../../api/gateway'
import type { IRunbook } from '../../../api/job'

const props = defineProps<{ visible: boolean; runbookId?: number }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'success', executionId: number): void }>()

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const formRef = ref()
const loading = ref(false)
const runbookOptions = ref<IRunbook[]>([])
// 目标机下拉选项轻量结构（只需 id/name/model_code），便于「复用上次的」直接注入上次目标
interface ITargetOption { id: number; name: string; model_code?: string | null }
const resourceOptions = ref<ITargetOption[]>([])
const resSearching = ref(false)
const reuseLoading = ref(false)

const formData = reactive({
  runbook_id: undefined as number | undefined,
  code_ref: '',
  target_ids: [] as number[],
  // v34 连接三件套（执行时填，仅 target 型）
  ssh_user: '',
  ssh_credential: undefined as string | undefined,
  become: false,
  gateway_name: undefined as string | undefined,
})

// SSH 钥匙下拉数据源 = 凭据目录 kind=ssh_key；网关下拉 = job-gateways
const sshCredentials = ref<ICredential[]>([])
const gateways = ref<IJobGateway[]>([])
async function fetchCredOptions() {
  try {
    const [cred, gw] = await Promise.all([
      getCredentials({ kind: 'ssh_key', page: 1, page_size: 100 }),
      getGateways({ page: 1, page_size: 100 }),
    ])
    sshCredentials.value = cred.data.items
    gateways.value = gw.data.items
  } catch { /* ignore */ }
}

// 参数/密钥动态值
interface IParamSpec {
  type?: string
  required?: boolean
  default?: unknown
  default_ref?: string
  enum?: (string | number)[]
  description?: string
}
const paramValues = reactive<Record<string, unknown>>({})
const secretValues = reactive<Record<string, string>>({})

const selectedRunbook = computed(() => runbookOptions.value.find(r => r.id === formData.runbook_id))
const isLocal = computed(() => selectedRunbook.value?.run_on === 'local')
// v36：shell 是 ad-hoc 内联命令不落仓库，其余类型（ansible/script/python）runner 需 clone 仓库→要 code_ref
const needsCodeRef = computed(() => !!selectedRunbook.value && selectedRunbook.value.exec_type !== 'shell')

const paramsSchema = computed<Record<string, IParamSpec>>(() => {
  const out: Record<string, IParamSpec> = {}
  for (const [k, v] of Object.entries(selectedRunbook.value?.params_schema || {})) {
    if (v && typeof v === 'object') out[k] = v as IParamSpec
  }
  return out
})

const secretsSchema = computed<Record<string, IParamSpec>>(() => {
  const out: Record<string, IParamSpec> = {}
  for (const [k, v] of Object.entries(selectedRunbook.value?.secrets_schema || {})) {
    if (v && typeof v === 'object') out[k] = v as IParamSpec
  }
  return out
})

// v36：目标/版本不再从 runbook 继承（已删 default_*）；code_ref 显式传 > 平台配置 > 400
const codeRefHint = computed(() =>
  'runner 按此 tag 克隆约定 GitLab 仓库执行；平台未配默认版本时必填，留空会报 400',
)

const targetHint = computed(() => {
  const rb = selectedRunbook.value
  if (!rb) return ''
  const models = rb.target_models?.length ? rb.target_models : ['aliyun_ecs', 'gcp_compute']
  return `受目标模型约束：${models.join(' / ')}；仅运行中（running）资源可选；每次执行必须选择目标机`
})

function resetDynamicValues() {
  for (const k of Object.keys(paramValues)) delete paramValues[k]
  for (const k of Object.keys(secretValues)) delete secretValues[k]
}

function onRunbookChange() {
  resetDynamicValues()
  formData.target_ids = []
  resourceOptions.value = []
  if (!isLocal.value) searchResources('')
}

// 目标模型白名单：按 runbook 过滤资源下拉（UX 层，不替代后端校验）
const DEFAULT_TARGET_MODELS = ['aliyun_ecs', 'gcp_compute']
const modelCodeToId = ref<Record<string, number>>({})
const allowedModelIds = computed(() => {
  const codes = selectedRunbook.value?.target_models?.length ? selectedRunbook.value.target_models : DEFAULT_TARGET_MODELS
  return codes.map(c => modelCodeToId.value[c]).filter((id): id is number => id !== undefined)
})

async function searchResources(keyword: string) {
  resSearching.value = true
  try {
    let items: ICmdbResource[]
    if (allowedModelIds.value.length > 0) {
      // 按目标模型白名单逐模型查询后合并；仅 running 可作执行目标（与后端执行态硬校验同规则）
      const results = await Promise.all(allowedModelIds.value.map(mid =>
        getResourceList({ keyword: keyword || undefined, model_id: mid, status: 'running', page: 1, page_size: 20 }).then(r => r.data.items),
      ))
      items = results.flat()
    } else {
      items = (await getResourceList({ keyword: keyword || undefined, status: 'running', page: 1, page_size: 20 })).data.items
    }
    // 合并已选项，避免回显丢失
    const merged: ITargetOption[] = [...items]
    for (const r of resourceOptions.value) {
      if (formData.target_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    resourceOptions.value = merged
  } catch { /* ignore */ } finally { resSearching.value = false }
}

// 「复用上次的」：读本 Runbook 最近一次执行，带入目标机与版本（v36 取代已删的 runbook 默认值）
async function reuseLast() {
  const rb = selectedRunbook.value
  if (!rb) { Message.warning('请先选择 Runbook'); return }
  reuseLoading.value = true
  try {
    const res = await jobApi.getExecutions({ runbook_id: rb.id, page: 1, page_size: 1 })
    const last = res.data.items[0]
    if (!last) { Message.info('该 Runbook 暂无历史执行'); return }
    if (last.code_ref) formData.code_ref = last.code_ref
    if (!isLocal.value) {
      formData.target_ids = (last.target_resources || []).map(t => t.resource_id)
      const merged = [...resourceOptions.value]
      for (const t of last.target_resources || []) {
        if (!merged.some(m => m.id === t.resource_id)) merged.push({ id: t.resource_id, name: t.name, model_code: t.model_code })
      }
      resourceOptions.value = merged
    }
    Message.success('已带入上次执行的目标与版本')
  } catch { /* 拦截器已提示 */ } finally { reuseLoading.value = false }
}

watch(() => props.visible, async (v) => {
  if (!v) return
  formData.runbook_id = props.runbookId
  formData.code_ref = ''
  formData.target_ids = []
  formData.ssh_user = ''
  formData.ssh_credential = undefined
  formData.become = false
  formData.gateway_name = undefined
  resetDynamicValues()
  fetchCredOptions()
  try {
    const res = await jobApi.getRunbooks({ page: 1, page_size: 100 })
    runbookOptions.value = res.data.items
  } catch { /* 拦截器已提示 */ }
  try {
    const models = await getModels()
    const map: Record<string, number> = {}
    models.data.forEach(m => { map[m.code] = m.id })
    modelCodeToId.value = map
  } catch { /* ignore */ }
  if (selectedRunbook.value && !isLocal.value) searchResources('')
})

async function handleSubmit() {
  const rb = selectedRunbook.value
  if (!rb) { Message.warning('请选择 Runbook'); return }

  // 必填参数/密钥前置校验（后端同规则 400，前端拦消息更友好）
  for (const [k, spec] of Object.entries(paramsSchema.value)) {
    if (spec.required && spec.default === undefined && paramValues[k] === undefined) {
      Message.warning(`请填写必填参数：${k}`)
      return
    }
  }
  for (const [k, spec] of Object.entries(secretsSchema.value)) {
    if (spec.required && !spec.default_ref && !secretValues[k]?.trim()) {
      Message.warning(`请填写必填密钥：${k}（Vault 路径）`)
      return
    }
  }
  // v36：目标机每次执行都要显式选（runbook 已无默认目标）；无 target 型任务不受影响
  if (!isLocal.value && formData.target_ids.length === 0) {
    Message.warning('请至少选择一台目标机')
    return
  }
  const errors = await formRef.value?.validate()
  if (errors) return

  const params: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(paramValues)) if (v !== undefined && v !== '') params[k] = v
  const secrets: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(secretValues)) if (v?.trim()) secrets[k] = v.trim()

  loading.value = true
  try {
    const res = await jobApi.createExecution({
      runbook_id: rb.id,
      params,
      secrets,
      // 目标机必填（上方已拦）；local 型无目标不发送
      target_resource_ids: !isLocal.value && formData.target_ids.length ? [...formData.target_ids] : undefined,
      code_ref: formData.code_ref.trim() || undefined,
      // v34：target 型才发连接三件套；留空项不发送→后端走兜底链（主机标签/runbook 存量）
      ...(isLocal.value ? {} : {
        ssh_user: formData.ssh_user.trim() || undefined,
        ssh_credential: formData.ssh_credential || undefined,
        become: formData.become,
        gateway_name: formData.gateway_name || undefined,
      }),
    })
    Message.success('任务已下发')
    visibleProxy.value = false
    emit('success', res.data.id)
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.rb-meta { display: flex; align-items: center; gap: 6px; margin: -8px 0 $spacing-sm; }
.rb-entry { font-size: $font-size-xs; color: $text-hint; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.mono { font-family: $font-mono; }
.no-params { font-size: $font-size-xs; color: $text-hint; margin: 0 0 $spacing-sm; }
.reuse-bar { display: flex; align-items: center; gap: 8px; margin: -4px 0 $spacing-md; }
.reuse-bar .rb-entry { flex: none; }
.secrets-hint { font-size: $font-size-xs; color: $text-hint; margin: -4px 0 $spacing-sm; }
</style>
