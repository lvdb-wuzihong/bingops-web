<template>
  <div class="alert-event-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">指标告警</span>
        <a-space wrap>
          <a-select v-model="filters.status" placeholder="状态" allow-clear style="width: 110px" @change="handleSearch">
            <a-option value="firing">触发中</a-option>
            <a-option value="resolved">已恢复</a-option>
            <a-option value="error">回报异常</a-option>
          </a-select>
          <a-select v-model="filters.source" placeholder="来源" allow-clear style="width: 140px" @change="handleSearch">
            <a-option value="bingops">平台原生 bingops</a-option>
            <a-option value="n9e">夜莺 n9e</a-option>
          </a-select>
          <a-input v-model="filters.rule_code" placeholder="规则 code" allow-clear style="width: 160px" @change="handleSearch" />
          <a-range-picker v-model="dateRange" value-format="YYYY-MM-DD" style="width: 240px" @change="handleSearch" />
          <a-button @click="fetchAll">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="kind-tip" type="info">
        指标规则（状态型，绑 VictoriaMetrics / Prometheus 数据源）：firing 合并续命、可恢复，支持自动开单。日志类流水请看「日志告警」。
      </a-alert>

      <!-- KPI 卡 -->
      <a-row :gutter="12" class="kpi-row">
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">当前活跃 firing</span>
            <span class="kpi-value" :class="{ 'kpi-danger': (summary?.active_firing_total ?? 0) > 0 }">{{ summary?.active_firing_total ?? '-' }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">firing 事件</span>
            <span class="kpi-value">{{ sumCount('firing_count') }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">resolved 事件</span>
            <span class="kpi-value">{{ sumCount('resolved_count') }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">平均恢复时长</span>
            <span class="kpi-value kpi-sm">{{ summary?.avg_resolve_seconds != null ? fmtDuration(summary.avg_resolve_seconds) : '-' }}</span>
          </div>
        </a-col>
      </a-row>

      <!-- 图表：每日趋势 + 来源分布 -->
      <a-row :gutter="12" class="chart-row">
        <a-col :span="14">
          <div class="chart-card">
            <h5 class="chart-title">每日告警趋势</h5>
            <div ref="trendChartRef" class="chart-box"></div>
          </div>
        </a-col>
        <a-col :span="10">
          <div class="chart-card">
            <h5 class="chart-title">来源分布（firing）</h5>
            <div ref="sourceChartRef" class="chart-box"></div>
          </div>
        </a-col>
      </a-row>

      <!-- 事件表 -->
      <a-table
        :data="events"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        size="small"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #severity="{ record }">
          <a-tag size="small" :color="severityMap[record.severity]?.color || 'gray'">{{ severityMap[record.severity]?.text || record.severity }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-tooltip :content="resolveReasonText(record)">
            <a-tag size="small" :color="statusMap[record.status]?.color || 'gray'">{{ statusMap[record.status]?.text || record.status }}</a-tag>
          </a-tooltip>
        </template>
        <template #rule="{ record }">
          <span class="rule-code">{{ record.rule_code }}</span>
          <div v-if="record.rule_name" class="rule-name">{{ record.rule_name }}</div>
        </template>
        <template #first_seen="{ record }">{{ fmtTime(record.first_seen_at) }}</template>
        <template #duration="{ record }">
          <span v-if="record.status === 'firing'" class="live-text" :title="`自 ${fmtTime(record.first_seen_at)} 持续触发`">{{ fmtDuration(durationSec(record.first_seen_at, null)) }}</span>
          <span v-else-if="record.resolved_at">{{ fmtDuration(durationSec(record.first_seen_at, record.resolved_at)) }}</span>
          <span v-else>-</span>
        </template>
        <template #total_count="{ record }">{{ record.total_count > 0 ? record.total_count : '-' }}</template>
        <template #labels="{ record }">
          <a-space wrap size="mini">
            <a-tag v-for="(v, k) in limitedLabels(record.labels)" :key="k" size="small">{{ k }}: {{ v }}</a-tag>
            <a-tooltip v-if="labelCount(record.labels) > 3" :content="fullLabels(record.labels)">
              <a-tag size="small">+{{ labelCount(record.labels) - 3 }}</a-tag>
            </a-tooltip>
            <span v-if="!labelCount(record.labels)">-</span>
          </a-space>
        </template>
        <template #resource_ids="{ record }">
          <a-space wrap size="mini">
            <a-link v-for="rid in record.resource_ids" :key="rid" @click="$router.push({ name: 'ResourceDetail', params: { id: String(rid) } })">#{{ rid }}</a-link>
          </a-space>
          <span v-if="!record.resource_ids?.length">-</span>
        </template>
        <template #ticket_id="{ record }">
          <span v-if="record.ticket_id" class="ticket-id">#{{ record.ticket_id }}</span>
          <span v-else>-</span>
        </template>
        <template #details="{ record }">
          <a-tooltip v-if="detailsText(record)" :content="detailsText(record)"><span class="details-cell">{{ detailsText(record) }}</span></a-tooltip>
          <span v-else>-</span>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import * as alertApi from '../../api/alert'
import type { IAlertEvent, IAlertStatsSummary } from '../../api/alert'

use([CanvasRenderer, BarChart, PieChart, TooltipComponent, LegendComponent, GridComponent])

const STATUS_COLORS = { firing: '#f53f3f', resolved: '#00b42a', error: '#ff7d00' } as const

const severityMap: Record<number, { text: string; color: string }> = {
  1: { text: '严重', color: 'red' },
  2: { text: '中等', color: 'orange' },
  3: { text: '轻微', color: 'arcoblue' },
}
const statusMap: Record<string, { text: string; color: string }> = {
  firing: { text: '触发中', color: 'red' },
  resolved: { text: '已恢复', color: 'green' },
  error: { text: '回报异常', color: 'orange' },
}

const loading = ref(false)
const events = ref<IAlertEvent[]>([])
const summary = ref<IAlertStatsSummary | null>(null)
const filters = reactive({ status: undefined as string | undefined, source: undefined as string | undefined, rule_code: '' })
const dateRange = ref<[string, string] | undefined>()
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '级别', slotName: 'severity', width: 70 },
  { title: '状态', slotName: 'status', width: 88 },
  { title: '来源', dataIndex: 'source', width: 110 },
  { title: '规则', slotName: 'rule', width: 190 },
  { title: '首次触发', slotName: 'first_seen', width: 150 },
  { title: '持续/恢复', slotName: 'duration', width: 100 },
  { title: '计数', slotName: 'total_count', width: 66 },
  { title: 'labels', slotName: 'labels', width: 200 },
  { title: '关联资源', slotName: 'resource_ids', width: 100 },
  { title: '工单', slotName: 'ticket_id', width: 70 },
  { title: '明细', slotName: 'details', ellipsis: true, tooltip: true },
]

function timeRangeParams(): { since?: string; until?: string } {
  if (!dateRange.value?.[0]) return {}
  return {
    since: `${dateRange.value[0]}T00:00:00`,
    until: `${addDays(dateRange.value[1] ?? dateRange.value[0], 1)}T00:00:00`,
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function fetchEvents() {
  loading.value = true
  try {
    const res = await alertApi.getAlertEvents({
      status: filters.status, source: filters.source,
      rule_code: filters.rule_code || undefined,
      // 指标告警页锁定状态型事件
      rule_kind: 'metric',
      ...timeRangeParams(),
      page: pagination.current, page_size: pagination.pageSize,
    })
    events.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

async function fetchSummary(groupBy: 'day' | 'source'): Promise<IAlertStatsSummary | null> {
  try {
    return (await alertApi.getAlertStats({ group_by: groupBy, rule_kind: 'metric', ...timeRangeParams() })).data
  } catch { return null }
}

async function fetchAll() {
  await fetchEvents()
  const [byDay, bySource] = await Promise.all([fetchSummary('day'), fetchSummary('source')])
  // KPI 用 day 维度汇总（含时间窗过滤）
  if (byDay) summary.value = byDay
  renderTrendChart(byDay)
  renderSourceChart(bySource)
}

function sumCount(field: 'firing_count' | 'resolved_count' | 'error_count'): number {
  return (summary.value?.groups ?? []).reduce((acc, g) => acc + (g[field] || 0), 0)
}

function handleSearch() {
  pagination.current = 1
  fetchAll()
}
function onPageChange(page: number) { pagination.current = page; fetchEvents() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchEvents() }

// ---------- 渲染辅助 ----------

function fmtTime(t: string | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function durationSec(from: string, to: string | null): number {
  const end = to ? new Date(to).getTime() : Date.now()
  return Math.max(0, Math.round((end - new Date(from).getTime()) / 1000))
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`
}

function resolveReasonText(record: IAlertEvent): string {
  if (record.status !== 'resolved') return statusMap[record.status]?.text || record.status
  return record.resolve_reason === 'stale_timeout'
    ? '已恢复（超过 stale_minutes 未再回报，平台推导）'
    : '已恢复（来源直传恢复事件）'
}

function limitedLabels(labels: Record<string, string>): [string, string][] {
  return Object.entries(labels || {}).slice(0, 3)
}
function labelCount(labels: Record<string, string>): number {
  return Object.keys(labels || {}).length
}
function fullLabels(labels: Record<string, string>): string {
  return Object.entries(labels || {}).map(([k, v]) => `${k}: ${v}`).join('；')
}

function detailsText(record: IAlertEvent): string {
  if (record.error) return record.error
  if (record.details == null) return ''
  const s = typeof record.details === 'string' ? record.details : JSON.stringify(record.details)
  return s.length > 200 ? `${s.slice(0, 200)}…` : s
}

// ---------- ECharts ----------

const trendChartRef = ref<HTMLElement>()
const sourceChartRef = ref<HTMLElement>()
let trendChart: echarts.ECharts | null = null
let sourceChart: echarts.ECharts | null = null

function renderTrendChart(byDay: IAlertStatsSummary | null) {
  if (!trendChartRef.value) return
  trendChart ??= echarts.init(trendChartRef.value)
  const groups = [...(byDay?.groups ?? [])].sort((a, b) => a.key.localeCompare(b.key))
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    legend: { data: ['firing', 'resolved', 'error'], bottom: 0, textStyle: { color: '#597ef7' } },
    grid: { left: 40, right: 16, top: 20, bottom: 46 },
    xAxis: { type: 'category', data: groups.map(g => g.key), axisLabel: { color: '#4e5969' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#4e5969' } },
    series: [
      { name: 'firing', type: 'bar', stack: 'total', data: groups.map(g => g.firing_count), itemStyle: { color: STATUS_COLORS.firing } },
      { name: 'resolved', type: 'bar', stack: 'total', data: groups.map(g => g.resolved_count), itemStyle: { color: STATUS_COLORS.resolved } },
      { name: 'error', type: 'bar', stack: 'total', data: groups.map(g => g.error_count), itemStyle: { color: STATUS_COLORS.error } },
    ],
  })
}

function renderSourceChart(bySource: IAlertStatsSummary | null) {
  if (!sourceChartRef.value) return
  sourceChart ??= echarts.init(sourceChartRef.value)
  const data = (bySource?.groups ?? []).map((g, i) => ({
    name: g.key,
    value: g.firing_count,
    itemStyle: { color: ['#165dff', '#00b42a', '#ff7d00', '#722ed1', '#14c9c9'][i % 5] },
  }))
  sourceChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    legend: { bottom: 0, textStyle: { color: '#597ef7' } },
    series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'], data, label: { color: '#4e5969' } }],
  })
}

function handleResize() {
  trendChart?.resize()
  sourceChart?.resize()
}

onMounted(() => {
  fetchAll()
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  sourceChart?.dispose()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.kind-tip { margin-bottom: $spacing-md; }

.kpi-row { margin-bottom: $spacing-md; }
.kpi-card {
  background: $bg-card; border: 1px solid $border-color-light; border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;
  display: flex; flex-direction: column; gap: 4px;
}
.kpi-label { font-size: $font-size-xs; color: $text-secondary; }
.kpi-value { font-size: 24px; font-weight: 600; color: $text-primary; }
.kpi-sm { font-size: 18px; }
.kpi-danger { color: $color-danger; }

.chart-row { margin-bottom: $spacing-md; }
.chart-card {
  background: $bg-card; border: 1px solid $border-color-light; border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;
}
.chart-title { margin: 0 0 $spacing-xs; font-size: $font-size-sm; color: $text-secondary; }
.chart-box { height: 220px; }

.rule-code { font-weight: 500; color: $text-primary; }
.rule-name { font-size: $font-size-xs; color: $text-secondary; }
.live-text { color: $color-danger; }
.ticket-id { color: $color-primary; }
.details-cell { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
</style>
