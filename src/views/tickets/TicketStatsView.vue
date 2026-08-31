<template>
  <div class="ticket-stats">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">统计报表</span>
        <a-space wrap>
          <a-range-picker v-model="dateRange" value-format="YYYY-MM-DD" allow-clear style="width: 260px" @change="fetchStats" />
          <a-select v-model="groupId" placeholder="全部处理组" allow-clear style="width: 160px" @change="fetchStats">
            <a-option v-for="g in groupOptions" :key="g.id" :value="g.id">{{ g.name }}</a-option>
          </a-select>
          <a-button @click="fetchStats">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-spin :loading="loading">
        <!-- KPI 卡片 -->
        <a-row :gutter="12" class="kpi-row">
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="工单总数" :value="totals.total" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="待审批" :value="totals.pending_approval" :value-style="{ color: '#faad14' }" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="待处理" :value="totals.open" :value-style="{ color: '#1677ff' }" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="处理中" :value="totals.in_progress" :value-style="{ color: '#fa8c16' }" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="已解决" :value="totals.resolved" :value-style="{ color: '#52c41a' }" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="已关闭" :value="totals.closed" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="平均响应" :value="stats?.time.avg_response_minutes ?? undefined" suffix="分钟" /></a-card></a-col>
          <a-col :span="6"><a-card :bordered="false" class="stat-card"><a-statistic title="平均处理" :value="stats?.time.avg_handle_minutes ?? undefined" suffix="分钟" /></a-card></a-col>
        </a-row>

        <!-- 趋势 + 状态分布 -->
        <a-row :gutter="12">
          <a-col :span="16">
            <div class="chart-title">每日趋势（创建 / 解决）</div>
            <div ref="trendRef" class="chart-box" />
          </a-col>
          <a-col :span="8">
            <div class="chart-title">状态分布</div>
            <div ref="statusRef" class="chart-box" />
          </a-col>
        </a-row>

        <!-- 分类分布 + 处理人效能 -->
        <a-row :gutter="12">
          <a-col :span="8">
            <div class="chart-title">分类分布</div>
            <div ref="categoryRef" class="chart-box" />
          </a-col>
          <a-col :span="16">
            <div class="chart-title">处理人效能（按完成数排序）</div>
            <a-table :data="stats?.by_assignee ?? []" :pagination="false" size="small" row-key="user_id" :columns="assigneeColumns">
              <template #avg_response_minutes="{ record }">{{ fmtMin(record.avg_response_minutes) }}</template>
              <template #avg_handle_minutes="{ record }">{{ fmtMin(record.avg_handle_minutes) }}</template>
              <template #empty><a-empty description="暂无已指派工单数据" /></template>
            </a-table>
          </a-col>
        </a-row>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import * as ticketApi from '../../api/ticket'
import type { ITicketStats } from '../../api/ticket'
import * as metaApi from '../../api/ticketMeta'
import type { ITicketGroup } from '../../api/ticketMeta'

use([CanvasRenderer, LineChart, PieChart, TooltipComponent, LegendComponent, GridComponent])

const STATUS_META: Record<string, { text: string; color: string }> = {
  pending_approval: { text: '待审批', color: '#faad14' },
  open: { text: '待处理', color: '#1677ff' },
  in_progress: { text: '处理中', color: '#fa8c16' },
  resolved: { text: '已解决', color: '#52c41a' },
  closed: { text: '已关闭', color: '#86909c' },
  cancelled: { text: '已取消', color: '#ff4d4f' },
}

const loading = ref(false)
const stats = ref<ITicketStats | null>(null)
const dateRange = ref<string[]>([])
const groupId = ref<number | undefined>()
const groupOptions = ref<ITicketGroup[]>([])

const totals = computed(() => {
  const t = stats.value?.totals ?? {}
  return {
    total: t.total ?? 0,
    pending_approval: t.pending_approval ?? 0,
    open: t.open ?? 0,
    in_progress: t.in_progress ?? 0,
    resolved: t.resolved ?? 0,
    closed: t.closed ?? 0,
  }
})

const assigneeColumns = [
  { title: '处理人', dataIndex: 'name', width: 120 },
  { title: '被指派', dataIndex: 'assigned', width: 80 },
  { title: '已完成', dataIndex: 'done', width: 80 },
  { title: '平均响应', slotName: 'avg_response_minutes', width: 110 },
  { title: '平均处理', slotName: 'avg_handle_minutes', width: 110 },
]

function fmtMin(m: number | null): string {
  if (m === null || m === undefined) return '-'
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  const mm = Math.round(m % 60)
  if (h < 24) return mm ? `${h}小时${mm}分` : `${h}小时`
  return `${Math.floor(h / 24)}天${h % 24}小时`
}

// 后端 date_to 为排他边界，选择含尾日需 +1 天
function nextDay(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

async function fetchStats() {
  loading.value = true
  try {
    stats.value = (await ticketApi.getTicketStats({
      date_from: dateRange.value?.[0] || undefined,
      date_to: dateRange.value?.[1] ? nextDay(dateRange.value[1]) : undefined,
      group_id: groupId.value,
    })).data
    renderCharts()
  } catch { Message.error('获取统计数据失败') } finally { loading.value = false }
}

// ========== 图表 ==========
const trendRef = ref<HTMLElement>()
const statusRef = ref<HTMLElement>()
const categoryRef = ref<HTMLElement>()
let trendChart: echarts.ECharts | null = null
let statusChart: echarts.ECharts | null = null
let categoryChart: echarts.ECharts | null = null

function renderCharts() {
  if (!stats.value) return
  renderTrend()
  renderStatus()
  renderCategory()
}

function renderTrend() {
  if (!trendRef.value) return
  trendChart ??= echarts.init(trendRef.value)
  const trend = stats.value?.trend ?? []
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['创建', '解决'], bottom: 0 },
    grid: { left: 40, right: 16, top: 24, bottom: 40 },
    xAxis: { type: 'category', data: trend.map(t => t.date) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: '创建', type: 'line', smooth: true, data: trend.map(t => t.created), itemStyle: { color: '#1677ff' } },
      { name: '解决', type: 'line', smooth: true, data: trend.map(t => t.resolved), itemStyle: { color: '#52c41a' } },
    ],
  })
}

function renderStatus() {
  if (!statusRef.value) return
  statusChart ??= echarts.init(statusRef.value)
  const t = stats.value?.totals ?? {}
  const data = Object.entries(t)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => ({ name: STATUS_META[k]?.text || k, value: v, itemStyle: { color: STATUS_META[k]?.color || '#86909c' } }))
  statusChart.setOption({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['45%', '70%'], data, label: { formatter: '{b} {c}' } }],
  })
}

function renderCategory() {
  if (!categoryRef.value) return
  categoryChart ??= echarts.init(categoryRef.value)
  const data = (stats.value?.by_category ?? []).map(c => ({ name: c.category, value: c.total }))
  categoryChart.setOption({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['45%', '70%'], data, label: { formatter: '{b} {c}' }, itemStyle: { color: '#1677ff' } }],
  })
}

function handleResize() {
  trendChart?.resize()
  statusChart?.resize()
  categoryChart?.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  metaApi.getGroups().then(res => { groupOptions.value = res.data }).catch(() => { /* ignore */ })
  fetchStats()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  statusChart?.dispose()
  categoryChart?.dispose()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.ticket-stats { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }

.kpi-row { margin-bottom: $spacing-md; .stat-card { background: rgba(22, 119, 255, 0.04); margin-bottom: $spacing-sm; } }

.chart-title { font-size: $font-size-sm; font-weight: 600; color: $text-secondary; margin-bottom: $spacing-xs; }
.chart-box { width: 100%; height: 280px; }
</style>
