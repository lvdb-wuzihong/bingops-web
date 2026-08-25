<template>
  <div class="execution-detail">
    <div class="detail-header">
      <a-button type="text" @click="router.back()">
        <template #icon><icon-left /></template>返回列表
      </a-button>
      <a-space v-if="detail">
        <a-tag size="small" :color="executionStatus(detail.status).color">{{ executionStatus(detail.status).text }}</a-tag>
        <a-button v-if="detail.status === 'pending' || detail.status === 'running'" status="warning" @click="handleCancel">取消执行</a-button>
        <a-popconfirm v-if="detail.status === 'failed'" content="对失败执行触发手动回滚？" @ok="handleRollback">
          <a-button status="danger">手动回滚</a-button>
        </a-popconfirm>
        <a-button @click="fetchDetail">
          <template #icon><icon-refresh /></template>
        </a-button>
      </a-space>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <template v-if="detail">
        <!-- 概要 -->
        <a-card title="执行概要" class="detail-card" :bordered="false">
          <a-descriptions :column="2" layout="horizontal" size="medium">
            <a-descriptions-item label="执行 ID"><span class="mono-text">#{{ detail.id }}</span></a-descriptions-item>
            <a-descriptions-item label="Runbook">
              {{ runbookName }}（v{{ detail.runbook_version }}）
            </a-descriptions-item>
            <a-descriptions-item label="代码版本"><span class="mono-text">{{ detail.code_ref }}</span></a-descriptions-item>
            <a-descriptions-item label="回滚策略">{{ detail.rollback_policy }}</a-descriptions-item>
            <a-descriptions-item label="开始时间">{{ detail.started_at ? formatTime(detail.started_at) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="结束时间">{{ detail.finished_at ? formatTime(detail.finished_at) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="目标资源" :span="2">
              <a-space wrap>
                <a-tag v-for="t in detail.target_resources" :key="t.resource_id" size="small" color="arcoblue">
                  {{ t.name }}<span v-if="t.ip" class="target-ip">（{{ t.ip }}）</span>
                </a-tag>
              </a-space>
            </a-descriptions-item>
            <a-descriptions-item v-if="Object.keys(detail.params).length" label="执行参数" :span="2">
              <pre class="json-block">{{ JSON.stringify(detail.params, null, 2) }}</pre>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 步骤 -->
        <a-card title="步骤" class="detail-card" :bordered="false">
          <a-table :data="detail.steps" :columns="stepColumns" :pagination="false" size="small" row-key="id">
            <template #step_name="{ record }">
              {{ record.step_name || record.step_key }}
              <a-tag v-if="record.attempt_type === 'undo'" size="small" color="orange">回滚</a-tag>
            </template>
            <template #type="{ record }"><a-tag size="small">{{ record.type }}</a-tag></template>
            <template #status="{ record }">
              <a-tag size="small" :color="executionStatus(record.status).color">{{ executionStatus(record.status).text }}</a-tag>
            </template>
            <template #exit_code="{ record }">{{ record.exit_code ?? '-' }}</template>
            <template #error_message="{ record }">
              <span v-if="record.error_message" class="error-text">{{ record.error_message }}</span>
              <span v-else>-</span>
            </template>
            <template #actions="{ record }">
              <a-button type="text" size="small" @click="openLogs(record)">
                <template #icon><icon-file /></template>日志
              </a-button>
            </template>
          </a-table>
          <a-empty v-if="detail.steps.length === 0" description="步骤尚未生成（执行 pending 中）" />
        </a-card>
      </template>
    </a-spin>

    <!-- 步骤日志抽屉（live tail） -->
    <a-drawer v-model:visible="logVisible" :title="`步骤日志 - ${logStepName}`" :width="720" unmount-on-close>
      <div ref="logBoxRef" class="log-box">
        <p v-if="logLines.length === 0" class="log-empty">暂无日志</p>
        <p v-for="line in logLines" :key="line.id" class="log-line" :class="`log-${line.level}`">
          <span class="log-host" v-if="line.host">[{{ line.host }}]</span>{{ line.line }}
        </p>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconLeft, IconRefresh, IconFile } from '@arco-design/web-vue/es/icon'
import * as jobApi from '../../api/job'
import { executionStatus, isActiveStatus } from '../../api/job'
import type { IExecutionDetail, IJobStep, IStepLog } from '../../api/job'
import { getRunbook } from '../../api/job'

const route = useRoute()
const router = useRouter()
const executionId = Number(route.params.id)

const loading = ref(false)
const detail = ref<IExecutionDetail | null>(null)
const runbookName = ref('')

const stepColumns = [
  { title: '步骤', slotName: 'step_name', width: 200, ellipsis: true },
  { title: '类型', slotName: 'type', width: 90 },
  { title: '状态', slotName: 'status', width: 100 },
  { title: '退出码', slotName: 'exit_code', width: 80 },
  { title: '错误', slotName: 'error_message', ellipsis: true },
  { title: '操作', slotName: 'actions', width: 80 },
]

async function fetchDetail() {
  loading.value = true
  try {
    const res = await jobApi.getExecution(executionId)
    detail.value = res.data
    try {
      const rb = await getRunbook(res.data.runbook_id)
      runbookName.value = rb.data.name
    } catch { runbookName.value = `Runbook #${res.data.runbook_id}` }
  } catch { Message.error('获取执行详情失败') } finally { loading.value = false }
}

// 活跃态轮询刷新步骤状态
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (detail.value && isActiveStatus(detail.value.status)) fetchDetail()
  }, 4000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function handleCancel() {
  try { await jobApi.cancelExecution(executionId); Message.success('已取消'); fetchDetail() } catch { /* 拦截器已提示 */ }
}

async function handleRollback() {
  try { await jobApi.rollbackExecution(executionId); Message.success('回滚已下发'); fetchDetail() } catch { /* 拦截器已提示 */ }
}

// ========== 步骤日志 live tail ==========
const logVisible = ref(false)
const logStepName = ref('')
const logLines = ref<IStepLog[]>([])
const logBoxRef = ref<HTMLElement>()
let logStepId: number | null = null
let logSeq = 0
let logTimer: ReturnType<typeof setInterval> | null = null

async function pullLogs() {
  if (logStepId === null) return
  try {
    const res = await jobApi.getStepLogs(logStepId, logSeq)
    if (res.data.length > 0) {
      logLines.value = [...logLines.value, ...res.data]
      logSeq = res.data[res.data.length - 1].seq
      nextTick(() => { if (logBoxRef.value) logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight })
    }
  } catch { /* ignore */ }
}

function openLogs(step: IJobStep) {
  logStepId = step.id
  logStepName.value = step.step_name || step.step_key
  logLines.value = []
  logSeq = 0
  logVisible.value = true
  pullLogs()
  stopLogPolling()
  logTimer = setInterval(pullLogs, 2000)
}

function stopLogPolling() {
  if (logTimer) { clearInterval(logTimer); logTimer = null }
}

watch(logVisible, (v) => { if (!v) stopLogPolling() })

function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

onMounted(() => {
  fetchDetail()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  stopLogPolling()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.execution-detail { display: flex; flex-direction: column; gap: $spacing-md; }

.detail-header { display: flex; justify-content: space-between; align-items: center; }

.detail-card { background: $bg-card; border: 1px solid $border-color-light; border-radius: $radius-md; }

.mono-text { font-family: $font-mono; color: $color-primary; }
.target-ip { color: $text-secondary; }
.error-text { color: $color-danger; }

.json-block {
  margin: 0;
  font-family: $font-mono;
  font-size: $font-size-xs;
  color: $text-body;
  background: rgba(22, 119, 255, 0.04);
  border-radius: $radius-sm;
  padding: $spacing-xs $spacing-sm;
  max-height: 200px;
  overflow: auto;
}

.log-box {
  height: calc(100vh - 160px);
  overflow-y: auto;
  background: #1d2129;
  border-radius: $radius-md;
  padding: $spacing-sm;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.7;
}

.log-empty { color: #86909c; }

.log-line {
  margin: 0;
  color: #e5e6eb;
  word-break: break-all;
  white-space: pre-wrap;

  &.log-warn { color: #f7ba1e; }
  &.log-error { color: #f53f3f; }
}

.log-host { color: #597ef7; margin-right: 6px; }
</style>
