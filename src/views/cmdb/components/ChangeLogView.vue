<template>
  <div class="changelog-view">
    <a-table :data="logs" :columns="columns" :pagination="false" :loading="loading" size="small" row-key="id">
      <template #change_type="{ record }">
        <a-tag :size="'small'" :color="record.change_type === 'create' ? 'green' : record.change_type === 'delete' ? 'red' : record.change_type === 'tag' ? 'purple' : 'blue'">
          {{ record.change_type === 'create' ? '创建' : record.change_type === 'delete' ? '删除' : record.change_type === 'tag' ? '标签' : '更新' }}
        </a-tag>
      </template>
      <template #old_value="{ record }">
        <span style="color: #ff4d4f; font-family: monospace; font-size: 12px;">{{ record.old_value || '-' }}</span>
      </template>
      <template #new_value="{ record }">
        <span style="color: #52c41a; font-family: monospace; font-size: 12px;">{{ record.new_value || '-' }}</span>
      </template>
      <template #field="{ record }">{{ record.field || '-' }}</template>
      <template #operator="{ record }">{{ record.operator || '-' }}</template>
      <template #created_at="{ record }">{{ formatTime(record.created_at) }}</template>
    </a-table>
    <a-empty v-if="!loading && logs.length === 0" description="暂无变更记录" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getChangeLogs } from '../../../api/changeLog'
import type { IChangeLog } from '../../../api/changeLog'

const props = defineProps<{ resourceId: number }>()

const loading = ref(false)
const logs = ref<IChangeLog[]>([])

const columns = [
  { title: '变更类型', slotName: 'change_type', width: 90 },
  { title: '字段', slotName: 'field', width: 120 },
  { title: '旧值', slotName: 'old_value', width: 160, ellipsis: true },
  { title: '新值', slotName: 'new_value', width: 160, ellipsis: true },
  { title: '来源', dataIndex: 'source', width: 80 },
  { title: '操作者', slotName: 'operator', width: 100 },
  { title: '时间', slotName: 'created_at', width: 170 },
]

function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function fetchLogs() {
  loading.value = true
  try { const res = await getChangeLogs({ resource_id: props.resourceId, page: 1, page_size: 50 }); logs.value = res.data.items } catch { /* ignore */ } finally { loading.value = false }
}

onMounted(() => fetchLogs())
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;
.changelog-view { display: flex; flex-direction: column; gap: $spacing-md; }
</style>
