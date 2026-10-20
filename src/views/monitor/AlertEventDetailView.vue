<template>
  <div class="alert-event-detail">
    <a-card :bordered="false" class="detail-card">
      <div class="detail-header">
        <a-button type="text" @click="goBack">
          <template #icon><icon-left /></template>返回{{ isLog ? '日志' : '指标' }}告警
        </a-button>
        <a-space>
          <!-- v29 轻闭环：认领=“有人在管了”，仅活跃 firing 可认；本人或超管可放手 -->
          <a-button v-if="canClaim && detail && detail.status === 'firing' && !detail.claimed_by" type="primary" status="warning" :loading="claiming" @click="handleClaim">
            <template #icon><icon-user /></template>认领
          </a-button>
          <a-button v-if="canClaim && detail && canRelease" status="normal" :loading="claiming" @click="handleRelease">
            <template #icon><icon-user />
            </template>放手
          </a-button>
          <a-dropdown v-if="canClaim && detail" trigger="click" @select="onVerdictSelect">
            <a-button>
              处置结论：<b v-if="detail.verdict">{{ VERDICT_MAP[detail.verdict]?.text || detail.verdict }}</b><b v-else class="unmarked">未标注</b>
              <template #icon><icon-down /></template>
            </a-button>
            <template #content>
              <a-doption v-for="(m, k) in VERDICT_MAP" :key="k" :value="k">
                {{ m.text }}<span v-if="detail.verdict === k" class="hint">（当前）</span>
              </a-doption>
            </template>
          </a-dropdown>
          <a-button v-if="canMute && detail" status="warning" @click="openMute"><template #icon><icon-notification /></template>屏蔽此告警</a-button>
          <a-button @click="fetchDetail"><template #icon><icon-refresh /></template></a-button>
        </a-space>
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
            <!-- v29：认领是 MTTA 起点，处置结论是告警准确率的统计原料 -->
            <a-descriptions-item label="认领">
              <span v-if="detail.claimed_by">{{ userName(detail.claimed_by) }}<span class="hint">（{{ fmtTime(detail.claimed_at) }}）</span></span>
              <span v-else class="hint">无人认领</span>
            </a-descriptions-item>
            <a-descriptions-item label="处置结论">
              <a-tag v-if="detail.verdict" size="small" :color="VERDICT_MAP[detail.verdict]?.color || 'gray'">{{ VERDICT_MAP[detail.verdict]?.text || detail.verdict }}</a-tag>
              <span v-else class="hint">未标注</span>
              <span v-if="detail.status === 'firing' && !detail.claimed_by" class="hint">· 持续告警会按规则间隔重复提醒，认领后静默</span>
            </a-descriptions-item>
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

    <AlertMuteModal v-model:visible="muteVisible" :preset="mutePreset" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconLeft, IconRefresh, IconNotification, IconUser, IconDown } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
// 级别与处置结论文案集中到 api 层（与规则页共用），别名保留模板里的旧名
import { SEVERITY_MAP as severityMap, VERDICT_MAP } from '../../api/alert'
import type { IAlertEvent } from '../../api/alert'
import { useUserNames } from '../../composables/useUserNames'
import { useUserStore } from '../../stores/user'
import AlertMuteModal from './components/AlertMuteModal.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const eventId = Number(route.params.id)
const canMute = computed(() => userStore.hasPermission('alert_mute:create'))
// v29 认领与标注统一权限码 alert:claim（无权限隐藏入口，后端 403 兜底）
const canClaim = computed(() => userStore.hasPermission('alert:claim'))
const myId = computed(() => userStore.currentUser?.id ?? null)
const isSuperuser = computed(() => userStore.currentUser?.is_superuser ?? false)
// 只有认领本人或超管可放手（后端同样校验，此处提前隐钮避免注定失败的点击）
const canRelease = computed(() => {
  const c = detail.value?.claimed_by
  return !!c && (c === myId.value || isSuperuser.value)
})
const claiming = ref(false)
// 认领人 id → 姓名（后端响应只给 id）
const { userName, ensureUserNames } = useUserNames()

async function handleClaim() {
  claiming.value = true
  try {
    detail.value = (await alertApi.claimAlertEvent(eventId)).data
    Message.success('已认领，重复提醒已静默')
    await ensureUserNames([detail.value?.claimed_by])
  } catch { /* 拦截器已提示（他人已认领 409 / 非 firing 400） */ } finally { claiming.value = false }
}

async function handleRelease() {
  claiming.value = true
  try {
    detail.value = (await alertApi.releaseAlertEvent(eventId)).data
    Message.success('已放手，恢复后重新进入重复提醒节奏')
  } catch { /* 拦截器已提示（非本人 403） */ } finally { claiming.value = false }
}

async function handleVerdict(verdict: VerdictKind) {
  if (detail.value?.verdict === verdict) return
  try {
    detail.value = (await alertApi.setAlertEventVerdict(eventId, verdict)).data
    Message.success('处置结论已标注')
  } catch { /* 拦截器已提示 */ }
}

// a-dropdown @select 回调值形态不定，收敛到结论值域
type VerdictKind = 'valid' | 'false_positive' | 'duplicate'

function onVerdictSelect(v: unknown) {
  if (typeof v === 'string' && v in VERDICT_MAP) handleVerdict(v as VerdictKind)
}
const muteVisible = ref(false)
const mutePreset = ref<{ rule_code?: string | null; labels?: Record<string, string>; note?: string | null } | null>(null)

const loading = ref(false)
const detail = ref<IAlertEvent | null>(null)

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
  try {
    detail.value = (await alertApi.getAlertEvent(eventId)).data
    await ensureUserNames([detail.value?.claimed_by])
    // 飞书卡片可带 ?action=mute 直达屏蔽表单（一行增强，非必须）
    if (route.query.action === 'mute' && canMute.value) openMute()
  } catch { detail.value = null } /* 拦截器已提示（404/403） */ finally { loading.value = false }
}

// 快捷屏蔽预填：rule_code 取当前事件、labels 预填关键标签（env/app/hostname/pod，用户可删减）、note 标来源事件
function buildMutePreset() {
  const d = detail.value
  if (!d) return null
  const pick: Record<string, string> = {}
  for (const k of ['env', 'app', 'hostname', 'pod']) { const v = d.labels?.[k]; if (v) pick[k] = v }
  return { rule_code: d.rule_code, labels: pick, note: `屏蔽来自事件 #${d.id}` }
}
function openMute() { mutePreset.value = buildMutePreset(); muteVisible.value = true }

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
.unmarked { color: $text-hint; font-weight: 400; }
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
