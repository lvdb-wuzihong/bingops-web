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

        <a-form-item v-if="!isLocal" field="code_ref" label="代码版本（git tag）" :extra="codeRefHint">
          <a-input v-model="formData.code_ref" :placeholder="selectedRunbook.default_code_ref || '如：v1.0.0'" />
        </a-form-item>

        <a-form-item v-if="!isLocal" field="target_ids" label="目标资源" :extra="targetHint">
          <a-select
            v-model="formData.target_ids"
            multiple allow-search :filter-option="false" :loading="resSearching"
            placeholder="留空 = 使用 Runbook 默认目标；输入名称/实例 ID 搜索"
            @search="searchResources"
          >
            <a-option v-for="r in resourceOptions" :key="r.id" :value="r.id">{{ r.name }}（{{ r.model_code || '-' }} · #{{ r.id }}）</a-option>
          </a-select>
        </a-form-item>

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
              :placeholder="spec.default_ref ? `留空 = 用默认 ${spec.default_ref}` : (spec.required ? 'Vault 路径，必填' : 'Vault 路径，可选')"
            />
          </a-form-item>
        </template>
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
const resourceOptions = ref<ICmdbResource[]>([])
const resSearching = ref(false)

const formData = reactive({
  runbook_id: undefined as number | undefined,
  code_ref: '',
  target_ids: [] as number[],
})

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

// v26 继承：默认值存在时可留空（未传 → 后端走继承链；全空才 400）
const codeRefHint = computed(() => {
  const rb = selectedRunbook.value
  if (!rb) return ''
  return rb.default_code_ref
    ? `留空 = 继承 Runbook 默认版本「${rb.default_code_ref}」；runner 按 tag 克隆仓库，后端不校验 tag 存在性`
    : 'runner 将按此 tag 克隆约定 GitLab 仓库；平台未配默认版本时必填'
})

const targetHint = computed(() => {
  const rb = selectedRunbook.value
  if (!rb) return ''
  const models = rb.target_models?.length ? rb.target_models : ['aliyun_ecs', 'gcp_compute']
  const defaults = (rb.default_target_resource_ids || []).length ? `留空 = 继承默认目标（${rb.default_target_resource_ids.length} 台）` : '未配置默认目标，必须选择'
  return `受目标模型约束：${models.join(' / ')}；仅运行中（running）资源可选；${defaults}`
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
    const merged = [...items]
    for (const r of resourceOptions.value) {
      if (formData.target_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    resourceOptions.value = merged
  } catch { /* ignore */ } finally { resSearching.value = false }
}

watch(() => props.visible, async (v) => {
  if (!v) return
  formData.runbook_id = props.runbookId
  formData.code_ref = ''
  formData.target_ids = []
  resetDynamicValues()
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
  // 目标/版本留空不发送 → 后端走继承链（默认目标/默认 tag/平台配置），全空时 400 由拦截器透传
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
      // 留空不发送 → 后端继承 runbook 默认（显式传 [] 会被视为「无目标」）
      target_resource_ids: !isLocal.value && formData.target_ids.length ? [...formData.target_ids] : undefined,
      code_ref: formData.code_ref.trim() || undefined,
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
</style>
