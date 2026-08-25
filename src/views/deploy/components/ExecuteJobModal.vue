<template>
  <a-modal v-model:visible="visibleProxy" title="执行 Runbook" :width="560" :ok-loading="loading" @ok="handleSubmit">
    <a-form :model="formData" :rules="rules" layout="vertical" ref="formRef">
      <a-form-item field="runbook_id" label="Runbook">
        <a-select v-model="formData.runbook_id" placeholder="请选择" :disabled="!!props.runbookId" allow-search>
          <a-option v-for="rb in runbookOptions" :key="rb.id" :value="rb.id" :disabled="!rb.is_active">
            {{ rb.name }}（v{{ rb.version }}）
          </a-option>
        </a-select>
      </a-form-item>
      <a-form-item field="code_ref" label="代码版本（git tag）">
        <a-input v-model="formData.code_ref" placeholder="如：v1.0.0" />
        <template #extra>
          <span class="code-ref-tip">runner 将按此 tag 克隆约定 GitLab 仓库执行 playbook；后端不校验 tag 存在性，克隆失败会回报为执行失败</span>
        </template>
      </a-form-item>
      <a-form-item field="target_ids" label="目标资源">
        <a-select
          v-model="formData.target_ids"
          multiple
          allow-search
          :filter-option="false"
          :loading="resSearching"
          placeholder="输入名称搜索资源"
          @search="searchResources"
        >
          <a-option v-for="r in resourceOptions" :key="r.id" :value="r.id">{{ r.name }}（#{{ r.id }}）</a-option>
        </a-select>
        <template #extra>
          <span class="code-ref-tip">受 runbook 目标模型约束：{{ targetModelCodes.join(' / ') }}，其他模型资源不可选</span>
        </template>
      </a-form-item>
      <a-form-item field="paramsText" label="执行参数（JSON，可选）">
        <a-textarea v-model="formData.paramsText" placeholder='{"key": "value"}' :auto-size="{ minRows: 2, maxRows: 6 }" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import * as jobApi from '../../../api/job'
import { getResourceList } from '../../../api/cmdb'
import type { ICmdbResource } from '../../../api/cmdb'
import type { IRunbook } from '../../../api/job'
import { getModels } from '../../../api/model'

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

// 目标模型白名单：选定 runbook 后按模型过滤资源下拉，避免误选 Pod 等非目标模型
const DEFAULT_TARGET_MODELS = ['aliyun_ecs', 'gcp_compute']
const modelCodeToId = ref<Record<string, number>>({})
const targetModelCodes = ref<string[]>([...DEFAULT_TARGET_MODELS])
const allowedModelIds = computed(() =>
  targetModelCodes.value.map(c => modelCodeToId.value[c]).filter((id): id is number => id !== undefined),
)

function applyTargetModels() {
  const rb = runbookOptions.value.find(r => r.id === formData.runbook_id)
  targetModelCodes.value = rb?.target_models && rb.target_models.length ? rb.target_models : [...DEFAULT_TARGET_MODELS]
  // 模型约束变化后清空已选目标，防止残留非法选择
  formData.target_ids = []
  resourceOptions.value = []
}

const formData = reactive({
  runbook_id: undefined as number | undefined,
  code_ref: '',
  target_ids: [] as number[],
  paramsText: '',
})

const rules = {
  runbook_id: [{ required: true, message: '请选择 Runbook' }],
  code_ref: [{ required: true, message: '请输入代码版本' }],
  target_ids: [{ required: true, type: 'array' as const, min: 1, message: '请选择目标资源' }],
}

watch(() => props.visible, async (v) => {
  if (!v) return
  formData.runbook_id = props.runbookId
  formData.code_ref = ''
  formData.target_ids = []
  formData.paramsText = ''
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
  applyTargetModels()
  searchResources('')
})

watch(() => formData.runbook_id, () => { if (props.visible) applyTargetModels() })

async function searchResources(keyword: string) {
  resSearching.value = true
  try {
    let items: ICmdbResource[]
    if (allowedModelIds.value.length > 0) {
      // 按目标模型白名单逐模型查询后合并，下拉只出现 ECS/GCE 等目标模型
      const results = await Promise.all(allowedModelIds.value.map(mid =>
        getResourceList({ keyword: keyword || undefined, model_id: mid, page: 1, page_size: 20 }).then(r => r.data.items),
      ))
      items = results.flat()
    } else {
      items = (await getResourceList({ keyword: keyword || undefined, page: 1, page_size: 20 })).data.items
    }
    // 合并已选项，避免回显丢失
    const merged = [...items]
    for (const r of resourceOptions.value) {
      if (formData.target_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    resourceOptions.value = merged
  } catch { /* ignore */ } finally { resSearching.value = false }
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  let params: Record<string, unknown> = {}
  if (formData.paramsText.trim()) {
    try {
      params = JSON.parse(formData.paramsText)
    } catch {
      Message.warning('执行参数不是合法 JSON')
      return
    }
  }
  loading.value = true
  try {
    const res = await jobApi.createExecution({
      runbook_id: formData.runbook_id!,
      code_ref: formData.code_ref,
      target_resource_ids: formData.target_ids,
      params,
    })
    Message.success('任务已下发')
    visibleProxy.value = false
    emit('success', res.data.id)
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.code-ref-tip { font-size: $font-size-xs; color: $text-secondary; }
</style>
