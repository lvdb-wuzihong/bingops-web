<template>
  <div class="log-alert-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">日志告警</span>
        <a-space wrap>
          <a-select v-model="filters.status" placeholder="状态" allow-clear style="width: 110px" @change="handleSearch">
            <a-option value="recorded">流水记录</a-option>
            <a-option value="error">回报异常</a-option>
          </a-select>
          <a-select v-model="filters.source" placeholder="来源" allow-clear style="width: 140px" @change="handleSearch">
            <a-option value="bingops">平台原生 bingops</a-option>
          </a-select>
          <a-input v-model="filters.rule_code" placeholder="规则 code" allow-clear style="width: 160px" @change="handleSearch" />
          <a-range-picker v-model="dateRange" value-format="YYYY-MM-DD" style="width: 240px" @change="handleSearch" />
          <a-button @click="fetchAll">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="kind-tip" type="info">
        日志规则（事件型，绑 ClickHouse 数据源）：每轮命中记一条流水，不合并、无恢复概念，不做自动开单。指标类状态告警请看「指标告警」。
      </a-alert>

      <!-- KPI 卡 -->
      <a-row :gutter="12" class="kpi-row">
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">流水条数</span>
            <span class="kpi-value">{{ kpi.recordedCount }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">命中总次数</span>
            <span class="kpi-value">{{ kpi.recordedErrorTotal }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">涉及规则</span>
            <span class="kpi-value">{{ kpi.ruleCount }}</span>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="kpi-card">
            <span class="kpi-label">回报异常</span>
            <span class="kpi-value" :class="{ 'kpi-danger': kpi.errorCount > 0 }">{{ kpi.errorCount }}</span>
          </div>
        </a-col>
      </a-row>

      <!-- 趋势：流水条数 + 命中次数 双轴 -->
      <div class="chart-row">
        <div class="chart-card">
          <h5 class="chart-title">每日流水趋势（条数 / 命中次数）</h5>
          <div ref="trendChartRef" class="chart-box"></div>
        </div>
      </div>

      <!-- 流水表 -->
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
          <a-tooltip v-if="record.status === 'error'" :content="record.error || '评估失败'">
            <a-tag size="small" color="orange">回报异常</a-tag>
          </a-tooltip>
          <a-tag v-else size="small">流水记录</a-tag>
        </template>
        <template #rule="{ record }">
          <span class="rule-code">{{ record.rule_code }}</span>
          <div v-if="record.rule_name" class="rule-name">{{ record.rule_name }}</div>
        </template>
        <template #first_seen="{ record }">{{ fmtTime(record.first_seen_at) }}</template>
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
        <template #details="{ record }">
          <a-tooltip v-if="detailsText(record)" :content="detailsText(record)"><span class="details-cell">{{ detailsText(record) }}</span></a-tooltip>
          <span v-else>-</span>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import * as alertApi from '../../api/alert'
import type { IAlertEvent, IAlertStatsSummary } from '../../api/alert'

use([CanvasRenderer, BarChart, LineChart, TooltipComponent, LegendComponent, GridComponent])

const severityMap: Record<number, { text: string; color: string }> = {
  1: { text: '严重', color: 'red' },
  2: { text: '中等', color: 'orange' },
  3: { text: '轻微', color: 'arcoblue' },
}

const loading = ref(false)
const events = ref<IAlertEvent[]>([])
// rule_code 维度统计：KPI 与「流水条数排名」共用一份数据
const byRule = ref<IAlertStatsSummary | null>(null)
const byDay = ref<IAlertStatsSummary | null>(null)
const filters = reactive({ status: undefined as string | undefined, source: undefined as string | undefined, rule_code: '' })
const dateRange = ref<[string, string] | undefined>()
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '级别', slotName: 'severity', width: 70 },
  { title: '状态', slotName: 'status', width: 88 },
  { title: '来源', dataIndex: 'source', width: 110 },
  { title: '规则', slotName: 'rule', width: 190 },
  { title: '时间', slotName: 'first_seen', width: 150 },
  { title: '命中次数', slotName: 'total_count', width: 90 },
  { title: 'labels', slotName: 'labels', width: 200 },
  { title: '关联资源', slotName: 'resource_ids', width: 100 },
  { title: '明细', slotName: 'details', ellipsis: true, tooltip: true },
]

const kpi = computed(() => {
  const groups = byRule.value?.groups ?? []
  return {
    recordedCount: groups.reduce((acc, g) => acc + (g.recorded_count || 0), 0),
    recordedErrorTotal: groups.reduce((acc, g) => acc + (g.recorded_error_total || 0), 0),
    ruleCount: groups.length,
    errorCount: groups.reduce((acc, g) => acc + (g.error_count || 0), 0),
  }
})

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
      // 日志告警页锁定事件型流水
      rule_kind: 'log',
      ...timeRangeParams(),
      page: pagination.current, page_size: pagination.pageSize,
    })
    events.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

async function fetchSummary(groupBy: 'day' | 'rule_code'): Promise<IAlertStatsSummary | null> {
  try {
    return (await alertApi.getAlertStats({ group_by: groupBy, rule_kind: 'log', ...timeRangeParams() })).data
  } catch { return null }
}

async function fetchAll() {
  await fetchEvents()
  const [rule, day] = await Promise.all([fetchSummary('rule_code'), fetchSummary('day')])
  byRule.value = rule
  byDay.value = day
  renderTrendChart(day)
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
let trendChart: echarts.ECharts | null = null

function renderTrendChart(day: IAlertStatsSummary | null) {
  if (!trendChartRef.value) return
  trendChart ??= echarts.init(trendChartRef.value)
  const groups = [...(day?.groups ?? [])].sort((a, b) => a.key.localeCompare(b.key))
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    legend: { data: ['流水条数', '命中次数'], bottom: 0, textStyle: { color: '#597ef7' } },
    grid: { left: 48, right: 56, top: 20, bottom: 46 },
    xAxis: { type: 'category', data: groups.map(g => g.key), axisLabel: { color: '#4e5969' } },
    yAxis: [
      { type: 'value', minInterval: 1, name: '条数', axisLabel: { color: '#4e5969' }, splitLine: { show: true } },
      { type: 'value', name: '命中', axisLabel: { color: '#4e5969' }, splitLine: { show: false } },
    ],
    series: [
      { name: '流水条数', type: 'bar', data: groups.map(g => g.recorded_count), itemStyle: { color: '#165dff' } },
      { name: '命中次数', type: 'line', yAxisIndex: 1, smooth: true, data: groups.map(g => g.recorded_error_total), itemStyle: { color: '#ff7d00' }, lineStyle: { color: '#ff7d00' } },
    ],
  })
}

function handleResize() {
  trendChart?.resize()
}

onMounted(() => {
  fetchAll()
  window.addEventListener('resize', handleResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
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
.kpi-danger { color: $color-danger; }

.chart-row { margin-bottom: $spacing-md; }
.chart-card {
  background: $bg-card; border: 1px solid $border-color-light; border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;
}
.chart-title { margin: 0 0 $spacing-xs; font-size: $font-size-sm; color: $text-secondary; }
.chart-box { height: 240px; }

.rule-code { font-weight: 500; color: $text-primary; }
.rule-name { font-size: $font-size-xs; color: $text-secondary; }
.details-cell { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
</style>
