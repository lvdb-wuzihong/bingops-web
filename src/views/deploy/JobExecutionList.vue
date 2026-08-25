<template>
  <div class="execution-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">执行记录</span>
        <a-space>
          <a-select v-model="queryParams.status" placeholder="状态" allow-clear style="width: 130px" @change="handleSearch">
            <a-option v-for="(v, k) in EXECUTION_STATUS_MAP" :key="k" :value="k">{{ v.text }}</a-option>
          </a-select>
          <a-select v-model="queryParams.runbook_id" placeholder="Runbook" allow-clear allow-search style="width: 200px" @change="handleSearch">
            <a-option v-for="rb in runbookOptions" :key="rb.id" :value="rb.id">{{ rb.name }}</a-option>
          </a-select>
          <a-button type="primary" @click="executeVisible = true">
            <template #icon><icon-play-arrow /></template>新增执行
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
            <icon-thunderbolt :style="{ fontSize: '48px', color: '#c9cdd4' }" />
            <p class="empty-title">暂无执行记录</p>
            <p class="empty-desc">选择 Runbook 与目标资源下发运维作业</p>
            <a-button type="primary" size="small" @click="executeVisible = true"><template #icon><icon-play-arrow /></template>新增执行</a-button>
          </div>
        </template>
        <template #id="{ record }">
          <a-link @click="goDetail(record.id)">#{{ record.id }}</a-link>
        </template>
        <template #runbook="{ record }">
          {{ runbookNameMap[record.runbook_id] || `Runbook #${record.runbook_id}` }}
          <span class="ver-text">v{{ record.runbook_version }}</span>
        </template>
        <template #status="{ record }">
          <a-tag size="small" :color="executionStatus(record.status).color">{{ executionStatus(record.status).text }}</a-tag>
        </template>
        <template #targets="{ record }">{{ (record.target_resources || []).length }} 台</template>
        <template #code_ref="{ record }"><span class="mono-text">{{ record.code_ref }}</span></template>
        <template #started_at="{ record }">{{ record.started_at ? formatTime(record.started_at) : '-' }}</template>
        <template #actions="{ record }">
          <a-space>
            <a-button v-if="record.status === 'pending' || record.status === 'running'" type="text" size="small" status="warning" @click="handleCancel(record.id)">取消</a-button>
            <a-popconfirm v-if="record.status === 'failed'" content="对失败执行触发手动回滚？" @ok="handleRollback(record.id)">
              <a-button type="text" size="small" status="danger">回滚</a-button>
            </a-popconfirm>
            <a-button type="text" size="small" @click="goDetail(record.id)"><template #icon><icon-eye /></template></a-button>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <ExecuteJobModal v-model:visible="executeVisible" @success="onExecuted" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconRefresh, IconPlayArrow, IconEye, IconThunderbolt } from '@arco-design/web-vue/es/icon'
import * as jobApi from '../../api/job'
import { EXECUTION_STATUS_MAP, executionStatus, isActiveStatus } from '../../api/job'
import type { IExecution, IRunbook } from '../../api/job'
import ExecuteJobModal from './components/ExecuteJobModal.vue'

const router = useRouter()

const loading = ref(false)
const tableData = ref<IExecution[]>([])
const queryParams = reactive({ status: undefined as string | undefined, runbook_id: undefined as number | undefined })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })
const runbookOptions = ref<IRunbook[]>([])
const runbookNameMap = ref<Record<number, string>>({})

const columns = [
  { title: 'ID', slotName: 'id', width: 70 },
  { title: 'Runbook', slotName: 'runbook', width: 200, ellipsis: true },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '目标', slotName: 'targets', width: 70 },
  { title: '代码版本', slotName: 'code_ref', width: 120, ellipsis: true },
  { title: '开始时间', slotName: 'started_at', width: 150 },
  { title: '操作', slotName: 'actions', width: 150 },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await jobApi.getExecutions({
      status: queryParams.status,
      runbook_id: queryParams.runbook_id,
      page: pagination.current,
      page_size: pagination.pageSize,
    })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取执行记录失败') } finally { loading.value = false }
}

// 存在活跃态执行时自动轮询刷新
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (tableData.value.some(e => isActiveStatus(e.status))) fetchData()
  }, 5000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function fetchRunbookOptions() {
  try {
    const res = await jobApi.getRunbooks({ page: 1, page_size: 100 })
    runbookOptions.value = res.data.items
    const map: Record<number, string> = {}
    res.data.items.forEach(rb => { map[rb.id] = rb.name })
    runbookNameMap.value = map
  } catch { /* ignore */ }
}

function handleSearch() { pagination.current = 1; fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }
function goDetail(id: number) { router.push({ name: 'JobExecutionDetail', params: { id: String(id) } }) }
function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function handleCancel(id: number) {
  try { await jobApi.cancelExecution(id); Message.success('已取消'); fetchData() } catch { /* 拦截器已提示 */ }
}

async function handleRollback(id: number) {
  try { await jobApi.rollbackExecution(id); Message.success('回滚已下发'); fetchData() } catch { /* 拦截器已提示 */ }
}

const executeVisible = ref(false)

function onExecuted(executionId: number) {
  fetchData()
  goDetail(executionId)
}

onMounted(() => {
  fetchRunbookOptions()
  fetchData()
  startPolling()
})

onUnmounted(stopPolling)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.execution-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }

.ver-text { margin-left: 4px; font-size: $font-size-xs; color: $text-secondary; }
.mono-text { font-family: $font-mono; font-size: $font-size-sm; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 8px;
  .empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 500; color: $text-primary; }
  .empty-desc { margin: 0 0 12px; font-size: 13px; color: $text-secondary; }
}
</style>
