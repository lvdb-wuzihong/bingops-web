<template>
  <div class="dashboard">
    <!-- 统计卡片（真实数据） -->
    <div class="stat-cards">
      <div v-for="item in statItems" :key="item.key" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-info">
            <span class="stat-label">{{ item.label }}</span>
            <span class="stat-value">{{ item.value }}</span>
          </div>
          <div class="stat-icon" :style="{ background: item.gradient }">
            <component :is="item.icon" />
          </div>
        </div>
        <div class="stat-footer">
          <span class="stat-trend" :class="item.trendClass">
            {{ item.trendText }}
          </span>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-row">
      <a-card title="工单每日趋势（创建 / 解决）" class="chart-card chart-card-wide">
        <div ref="trendChartRef" class="chart-container"></div>
      </a-card>
      <a-card title="资产模型分布 TOP8" class="chart-card">
        <div ref="typeChartRef" class="chart-container"></div>
      </a-card>
    </div>

    <!-- 动态区域（真实数据） -->
    <div class="activity-row">
      <a-card title="最新工单" class="activity-card">
        <a-table :data="recentTickets" :columns="ticketColumns" :pagination="false" :bordered="false" size="small">
          <template #title="{ record }">
            <a-link @click="$router.push({ name: 'TicketList' })">{{ record.title }}</a-link>
          </template>
          <template #status="{ record }">
            <a-tag :color="STATUS_META[record.status]?.color || 'gray'" size="small">{{ STATUS_META[record.status]?.text || record.status }}</a-tag>
          </template>
          <template #created_at="{ record }">{{ formatTime(record.created_at) }}</template>
          <template #empty><a-empty description="暂无工单" /></template>
        </a-table>
      </a-card>
      <a-card title="处理人效能 TOP5（按完成数）" class="activity-card">
        <a-table :data="topAssignees" :columns="assigneeColumns" :pagination="false" :bordered="false" size="small">
          <template #avg_handle_minutes="{ record }">{{ fmtMin(record.avg_handle_minutes) }}</template>
          <template #avg_response_minutes="{ record }">{{ fmtMin(record.avg_response_minutes) }}</template>
          <template #empty><a-empty description="暂无已指派工单" /></template>
        </a-table>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import {
  IconDesktop,
  IconFile,
  IconClockCircle,
  IconSafe,
  IconThunderbolt,
} from '@arco-design/web-vue/es/icon'
import { getDashboardStats } from '../../api/dashboard'
import type { IResourceStats } from '../../api/cmdb'
import { getModels } from '../../api/model'
import { getTicketStats, getTickets, getFreezes } from '../../api/ticket'
import type { ITicketStats, ITicket } from '../../api/ticket'

use([CanvasRenderer, LineChart, PieChart, TooltipComponent, LegendComponent, GridComponent])

const STATUS_META: Record<string, { text: string; color: string }> = {
  pending_approval: { text: '待审批', color: 'gold' },
  open: { text: '待处理', color: 'blue' },
  in_progress: { text: '处理中', color: 'orange' },
  resolved: { text: '已解决', color: 'green' },
  closed: { text: '已关闭', color: 'gray' },
  cancelled: { text: '已取消', color: 'red' },
}

const trendChartRef = ref<HTMLElement>()
const typeChartRef = ref<HTMLElement>()

// ========== 真实数据 ==========
const cmdbStats = ref<IResourceStats | null>(null)
const ticketStats = ref<ITicketStats | null>(null)
const activeFreezeCount = ref(0)
const recentTickets = ref<ITicket[]>([])
const modelNameMap = ref<Record<string, string>>({})

const totals = computed(() => ticketStats.value?.totals ?? {})

const statItems = computed(() => [
  {
    key: 'resource',
    label: '资源总数',
    value: cmdbStats.value?.total ?? '-',
    icon: markRaw(IconDesktop),
    gradient: 'linear-gradient(135deg, #1677ff, #4096ff)',
    trendText: `${Object.keys(cmdbStats.value?.by_model ?? {}).length} 个模型`,
    trendClass: 'trend-good',
  },
  {
    key: 'open',
    label: '待处理工单',
    value: (totals.value.open ?? 0) + (totals.value.pending_approval ?? 0),
    icon: markRaw(IconFile),
    gradient: 'linear-gradient(135deg, #faad14, #d48806)',
    trendText: `其中 ${totals.value.pending_approval ?? 0} 个待审批`,
    trendClass: 'trend-warn',
  },
  {
    key: 'progress',
    label: '处理中工单',
    value: totals.value.in_progress ?? 0,
    icon: markRaw(IconThunderbolt),
    gradient: 'linear-gradient(135deg, #fa8c16, #d46b08)',
    trendText: `已解决 ${totals.value.resolved ?? 0} 个`,
    trendClass: 'trend-up',
  },
  {
    key: 'resp',
    label: '平均响应（分钟）',
    value: ticketStats.value?.time.avg_response_minutes ?? '-',
    icon: markRaw(IconClockCircle),
    gradient: 'linear-gradient(135deg, #2f54eb, #597ef7)',
    trendText: `平均处理 ${ticketStats.value?.time.avg_handle_minutes ?? '-'} 分钟`,
    trendClass: 'trend-good',
  },
  {
    key: 'freeze',
    label: '活跃封禁窗口',
    value: activeFreezeCount.value,
    icon: markRaw(IconSafe),
    gradient: 'linear-gradient(135deg, #ff5252, #ff1744)',
    trendText: '变更时点管控中',
    trendClass: 'trend-warn',
  },
])

const topAssignees = computed(() => (ticketStats.value?.by_assignee ?? []).slice(0, 5))

const ticketColumns = [
  { title: '标题', slotName: 'title', ellipsis: true },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '创建时间', slotName: 'created_at', width: 130 },
]

const assigneeColumns = [
  { title: '处理人', dataIndex: 'name', width: 110 },
  { title: '指派', dataIndex: 'assigned', width: 60 },
  { title: '完成', dataIndex: 'done', width: 60 },
  { title: '平均响应', slotName: 'avg_response_minutes', width: 100 },
  { title: '平均处理', slotName: 'avg_handle_minutes', width: 100 },
]

function formatTime(t: string | null) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtMin(m: number | null): string {
  if (m === null || m === undefined) return '-'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const mm = Math.round(m % 60)
  if (h < 24) return mm ? `${h}h${mm}m` : `${h}h`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

async function fetchAll() {
  const [cmdb, stats, freezes, tickets, models] = await Promise.allSettled([
    getDashboardStats(),
    getTicketStats(),
    getFreezes(true),
    getTickets({ page: 1, page_size: 6 }),
    getModels(),
  ])
  if (cmdb.status === 'fulfilled') cmdbStats.value = cmdb.value.data
  if (stats.status === 'fulfilled') ticketStats.value = stats.value.data
  if (freezes.status === 'fulfilled') activeFreezeCount.value = freezes.value.data.length
  if (tickets.status === 'fulfilled') recentTickets.value = tickets.value.data.items
  if (models.status === 'fulfilled') {
    const m: Record<string, string> = {}
    models.value.data.forEach(x => { m[String(x.id)] = x.name })
    modelNameMap.value = m
  }
  renderTrendChart()
  renderTypeChart()
}

// ========== 图表 ==========
let trendChart: echarts.ECharts | null = null
let typeChart: echarts.ECharts | null = null

function renderTrendChart() {
  if (!trendChartRef.value) return
  trendChart ??= echarts.init(trendChartRef.value)
  const trend = ticketStats.value?.trend ?? []
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    legend: { data: ['创建', '解决'], bottom: 0, textStyle: { color: '#597ef7' } },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: trend.map(x => x.date), axisLine: { lineStyle: { color: '#d6e4ff' } }, axisLabel: { color: '#597ef7' } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: '#e6f0ff' } }, axisLabel: { color: '#597ef7' } },
    series: [
      {
        name: '创建', type: 'line', smooth: true, data: trend.map(x => x.created),
        lineStyle: { color: '#1677ff', width: 2 }, itemStyle: { color: '#1677ff' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(22,119,255,0.2)' }, { offset: 1, color: 'rgba(22,119,255,0)' }]) },
      },
      {
        name: '解决', type: 'line', smooth: true, data: trend.map(x => x.resolved),
        lineStyle: { color: '#52c41a', width: 2 }, itemStyle: { color: '#52c41a' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(82,196,26,0.15)' }, { offset: 1, color: 'rgba(82,196,26,0)' }]) },
      },
    ],
  })
}

const MODEL_COLORS = ['#1677ff', '#2f54eb', '#4096ff', '#52c41a', '#faad14', '#fa8c16', '#722ed1', '#13c2c2']

function renderTypeChart() {
  if (!typeChartRef.value) return
  typeChart ??= echarts.init(typeChartRef.value)
  const byModel = cmdbStats.value?.by_model ?? {}
  const top = Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count], idx) => ({
      name: modelNameMap.value[id] || `#${id}`,
      value: count,
      itemStyle: { color: MODEL_COLORS[idx % MODEL_COLORS.length] },
    }))
  typeChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    series: [
      {
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'], avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#ffffff', borderWidth: 2 },
        label: { color: '#597ef7', fontSize: 12 },
        data: top,
      },
    ],
  })
}

function handleResize() {
  trendChart?.resize()
  typeChart?.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  fetchAll()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  typeChart?.dispose()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.dashboard {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: $spacing-md;

  @media (max-width: 1440px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 1280px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: $spacing-lg;
  backdrop-filter: blur(12px);
  transition: all $transition-base;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, $color-primary, transparent);
    opacity: 0;
    transition: opacity $transition-base;
  }

  &:hover {
    border-color: $border-glow;
    box-shadow: $shadow-glow;

    &::before {
      opacity: 1;
    }
  }
}

.stat-card-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.stat-label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  font-family: $font-mono;
  color: $text-primary;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: $radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: white;
}

.stat-footer {
  margin-top: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color-light;
}

.stat-trend {
  font-size: $font-size-xs;

  &.trend-up { color: $color-success; }
  &.trend-down { color: $color-success; }
  &.trend-good { color: $color-primary; }
  &.trend-warn { color: $color-warning; }
}

.chart-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: $spacing-md;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  background: $bg-card;
  border: 1px solid $border-color;
  backdrop-filter: blur(12px);
}

.chart-container {
  height: 280px;
}

.activity-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
}

.activity-card {
  background: $bg-card;
  border: 1px solid $border-color;
  backdrop-filter: blur(12px);
}
</style>
