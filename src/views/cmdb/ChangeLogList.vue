<template>
  <div class="change-log-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">变更审计</span>
        <a-space>
          <a-select v-model="queryParams.change_type" placeholder="变更类型" allow-clear style="width: 140px" @change="handleSearch">
            <a-option value="create">创建</a-option>
            <a-option value="update">更新</a-option>
            <a-option value="delete">删除</a-option>
          </a-select>
          <a-button @click="handleRefresh">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>
      <a-table
        :data="logs"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #change_type="{ record }">
          <a-tag :size="'small'" :color="changeTypeColor(record.change_type)">{{ changeTypeText(record.change_type) }}</a-tag>
        </template>
        <template #resource_name="{ record }">
          <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.resource_id) } })">
            {{ record.resource_name || `#${record.resource_id}` }}
          </a-link>
        </template>
        <template #model_name="{ record }">
          <a-tag size="small" color="arcoblue">{{ record.resource_type || '-' }}</a-tag>
        </template>
        <template #field="{ record }">{{ record.field || '-' }}</template>
        <template #old_value="{ record }">
          <span class="mono-text text-danger">{{ record.old_value || '-' }}</span>
        </template>
        <template #new_value="{ record }">
          <span class="mono-text text-success">{{ record.new_value || '-' }}</span>
        </template>
        <template #source="{ record }">
          <a-tag size="small" :color="record.source === 'api' ? 'blue' : record.source === 'sync' ? 'green' : 'orange'">{{ record.source }}</a-tag>
        </template>
        <template #operator="{ record }">{{ record.operator || '-' }}</template>
        <template #created_at="{ record }">
          {{ formatTime(record.created_at) }}
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { getChangeLogs } from '../../api/changeLog'
import type { IChangeLog, IChangeLogQuery } from '../../api/changeLog'

const loading = ref(false)
const logs = ref<IChangeLog[]>([])
const queryParams = reactive<IChangeLogQuery>({ change_type: undefined, page: 1, page_size: 20 })
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '资源名称', slotName: 'resource_name', width: 160, ellipsis: true },
  { title: '模型', slotName: 'model_name', width: 110 },
  { title: '变更类型', slotName: 'change_type', width: 90 },
  { title: '字段', slotName: 'field', width: 120 },
  { title: '旧值', slotName: 'old_value', width: 160, ellipsis: true },
  { title: '新值', slotName: 'new_value', width: 160, ellipsis: true },
  { title: '来源', slotName: 'source', width: 80 },
  { title: '操作者', slotName: 'operator', width: 100 },
  { title: '时间', slotName: 'created_at', width: 170 },
]

function changeTypeColor(t: string) { return t === 'create' ? 'green' : t === 'delete' ? 'red' : 'blue' }
function changeTypeText(t: string) { return t === 'create' ? '创建' : t === 'delete' ? '删除' : '更新' }
function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function fetchData() {
  loading.value = true
  try {
    const res = await getChangeLogs({ ...queryParams, page: pagination.current, page_size: pagination.pageSize })
    logs.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取变更日志失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }
function handleRefresh() { fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }

onMounted(() => fetchData())
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;
.change-log-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.mono-text { font-family: $font-mono; font-size: $font-size-sm; }
.text-danger { color: $color-danger; }
.text-success { color: $color-success; }
</style>
