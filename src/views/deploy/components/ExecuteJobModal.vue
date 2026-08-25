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
  searchResources('')
})

async function searchResources(keyword: string) {
  resSearching.value = true
  try {
    const res = await getResourceList({ keyword: keyword || undefined, page: 1, page_size: 20 })
    // 合并已选项，避免回显丢失
    const merged = [...res.data.items]
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
