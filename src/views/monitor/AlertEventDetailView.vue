<template>
  <div class="alert-event-detail">
    <a-card :bordered="false" class="detail-card">
      <div class="detail-header">
        <a-button type="text" @click="goBack">
          <template #icon><icon-left /></template>返回{{ isLog ? '日志' : '指标' }}告警
        </a-button>
        <a-button @click="fetchDetail"><template #icon><icon-refresh /></template></a-button>
      </div>

      <a-spin :loading="loading" style="width: 100%">
        <template v-if="detail">
          <!-- 标题行：级别 + 状态 + 规则 -->
          <div class="title-row">
            <a-space size="small" wrap>
              <a-tag :color="severityMap[detail.severity]?.color || 'gray'">{{ severityMap[detail.severity]?.text || detail.severity }}</a-tag>
              <a-tag :color="statusMap[detail.status]?.color || 'gray'">{{ statusMap[detail.status]?.text || detail.status }}</a-tag>
              <a-tag v-if="detail.rule_kind" size="small" :color="detail.rule_kind === 'log' ? 'cyan' : 'purple'">{{ kindText(detail.rule_kind) }}</a-tag>
            </a-space>
            <h2 class="title">{{ detail.rule_name || detail.rule_code }}</h2>
            <p class="sub mono">
              {{ detail.source }} · {{ detail.rule_code }}
              <span v-if="detail.monitoring_source_id"> · 数据源 #{{ detail.monitoring_source_id }}</span>
            </p>
          </div>

          <!-- 概要 -->
          <a-descriptions :column="2" layout="horizontal" size="medium" class="desc">
            <a-descriptions-item label="事件 ID"><span class="mono-text">#{{ detail.id }}</span></a-descriptions-item>
            <a-descriptions-item label="命中次数">{{ detail.total_count || '-' }}</a-descriptions-item>
            <a-descriptions-item label="首次触发">{{ fmtTime(detail.first_seen_at) }}</a-descriptions-item>
            <a-descriptions-item label="最近触发">{{ fmtTime(detail.last_seen_at) }}</a-descriptions-item>
            <a-descriptions-item label="窗口">{{ windowText }}</a-descriptions-item>
            <a-descriptions-item label="恢复">
              <span v-if="detail.status === 'resolved'">{{ fmtTime(detail.resolved_at) }}<span class="hint">（{{ resolveReasonText }}）</span></span>
              <span v-else-if="detail.status === 'firing'" class="live-text">持续触发 {{ fmtDuration(durationSec(detail.first_seen_at, null)) }}</span>
              <span v-else>-</span>
            </a-descriptions-item>
            <a-descriptions-item label="处理组">{{ detail.group_id ? '#' + detail.group_id : '-' }}</a-descriptions-item>
            <a-descriptions-item label="关联工单">
              <a-link v-if="detail.ticket_id" @click="goTicket(detail.ticket_id)">#{{ detail.ticket_id }}</a-link>
              <span v-else>-</span>
            </a-descriptions-item>
          </a-descriptions>

          <!-- 归属资源 -->
          <div v-if="detail.resource_ids?.length" class="sec">
            <h5 class="sec-title">关联资源（CMDB 尽力匹配）</h5>
            <a-space wrap size="mini">
              <a-link v-for="rid in detail.resource_ids" :key="rid" @click="$router.push({ name: 'ResourceDetail', params: { id: String(rid) } })">#{{ rid }}</a-link>
            </a-space>
          </div>

          <!-- labels -->
          <div v-if="Object.keys(detail.labels || {}).length" class="sec">
            <h5 class="sec-title">标签</h5>
            <a-space wrap size="mini">
              <a-tag v-for="(v, k) in detail.labels" :key="k" size="small">{{ k }}: {{ v }}</a-tag>
            </a-space>
          </div>

          <!-- error -->
          <div v-if="detail.error" class="sec">
            <h5 class="sec-title">评估异常</h5>
            <pre class="err-block">{{ detail.error }}</pre>
          </div>

          <!-- details：JSONB 黑盒，平台按形态人读呈现（不落解析逻辑） -->
          <div v-if="hasDetails" class="sec">
            <h5 class="sec-title">事件明细</h5>
            <!-- PromQL vector：逐序列 labels → 值 -->
            <div v-if="detailsKind === 'array'" class="vector-list">
              <div v-for="(item, i) in (detail.details as unknown[])" :key="i" class="vector-row">
                <span class="vector-metric mono">{{ metricLabelsText(item) }}</span>
                <span class="vector-value">{{ sampleValue(item) }}</span>
              </div>
            </div>
            <!-- CH 文本契约 / 其它：原样 -->
            <pre v-else class="json-block">{{ detailsText }}</pre>
          </div>
        </template>
        <a-empty v-else-if="!loading" description="事件不存在或无权访问" />
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconLeft, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import type { IAlertEvent } from '../../api/alert'

const route = useRoute()
const router = useRouter()
const eventId = Number(route.params.id)

const loading = ref(false)
const detail = ref<IAlertEvent | null>(null)

const severityMap: Record<number, { text: string; color: string }> = {
  1: { text: '严重', color: 'red' },
  2: { text: '中等', color: 'orange' },
  3: { text: '轻微', color: 'arcoblue' },
}
const statusMap: Record<string, { text: string; color: string }> = {
  firing: { text: '触发中', color: 'red' },
  resolved: { text: '已恢复', color: 'green' },
  error: { text: '回报异常', color: 'orange' },
  recorded: { text: '流水记录', color: 'cyan' },
}
function kindText(k: string): string { return k === 'log' ? '事件型' : '状态型' }

const isLog = computed(() => detail.value?.rule_kind === 'log')

async function fetchDetail() {
  loading.value = true
  try { detail.value = (await alertApi.getAlertEvent(eventId)).data }
  catch { detail.value = null } /* 拦截器已提示（404/403） */ finally { loading.value = false }
}

function goBack() { router.push({ name: isLog.value ? 'LogAlertList' : 'MetricAlertList' }) }
function goTicket(id: number) { router.push({ name: 'TicketList', params: { id: String(id) } }) }

// ---------- 渲染辅助 ----------
const windowText = computed(() => {
  const d = detail.value
  if (!d || !d.window_start) return '-'
  return `${fmtTime(d.window_start)} ~ ${fmtTime(d.window_end)}`
})
const resolveReasonText = computed(() => {
  const d = detail.value
  if (d?.resolve_reason === 'stale_timeout') return '超时推导恢复'
  if (d?.resolve_reason === 'resolved_event') return '来源直传恢复'
  return '已恢复'
})

function fmtTime(t: string | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
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

const detailsKind = computed<'empty' | 'str' | 'array' | 'object'>(() => {
  const d = detail.value?.details
  if (d == null || d === '') return 'empty'
  if (Array.isArray(d)) return d.length ? 'array' : 'empty'
  if (typeof d === 'string') return 'str'
  return 'object'
})
const hasDetails = computed(() => detailsKind.value !== 'empty')
const detailsText = computed(() => {
  const d = detail.value?.details
  if (d == null) return ''
  return typeof d === 'string' ? d : JSON.stringify(d, null, 2)
})
// PromQL vector 摘要元素形如 { metric: {labels}, value }
function metricLabelsText(item: unknown): string {
  const m = (item as { metric?: Record<string, string> })?.metric
  return m ? Object.entries(m).map(([k, v]) => `${k}=${v}`).join(', ') : JSON.stringify(item)
}
function sampleValue(item: unknown): string {
  const v = (item as { value?: unknown })?.value
  return v == null ? '-' : String(v)
}

onMounted(fetchDetail)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.alert-event-detail { width: 100%; }
.detail-card { background: $bg-card; border: 1px solid $border-color-light; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }

.title-row { margin-bottom: $spacing-md; }
.title { margin: $spacing-xs 0 2px; font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.sub { margin: 0; font-size: $font-size-sm; color: $text-secondary; }
.desc { margin-bottom: $spacing-md; }
.mono-text { font-family: $font-mono; color: $color-primary; }
.mono { font-family: $font-mono; }
.hint { font-size: $font-size-xs; color: $text-hint; }
.live-text { color: $color-danger; }

.sec { margin-bottom: $spacing-md; }
.sec-title { margin: 0 0 $spacing-xs; font-size: $font-size-sm; color: $text-secondary; }

.vector-list { display: flex; flex-direction: column; gap: 4px; }
.vector-row { display: flex; justify-content: space-between; gap: $spacing-md; padding: 4px $spacing-sm; background: rgba(22, 119, 255, 0.04); border-radius: $radius-sm; }
.vector-metric { color: $text-body; word-break: break-all; }
.vector-value { font-weight: 600; color: $color-primary; flex-shrink: 0; }

.json-block {
  margin: 0; font-family: $font-mono; font-size: $font-size-xs; color: $text-body;
  background: rgba(22, 119, 255, 0.04); border-radius: $radius-sm; padding: $spacing-xs $spacing-sm;
  max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-all;
}
.err-block { margin: 0; font-family: $font-mono; font-size: $font-size-xs; color: $color-danger; background: rgba(245, 63, 63, 0.06); border-radius: $radius-sm; padding: $spacing-xs $spacing-sm; white-space: pre-wrap; word-break: break-all; }
</style>
