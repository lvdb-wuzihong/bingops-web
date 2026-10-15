<template>
  <div class="alert-rule-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">告警规则</span>
        <a-space>
          <a-button type="primary" size="small" @click="router.push({ name: 'AlertRuleEdit' })">
            <template #icon><icon-plus /></template>新增规则
          </a-button>
          <a-button size="small" @click="fetchAll">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="rule-tip" type="info">
        规则决定告警的开单去向与评估方式：平台定义规则、执行器消费（rule_code 是事件聚合与统计的键）；绑定数据源与评估表达式后由执行器按节拍评估；未配置规则的告警事件照常落库，但跳过自动开单。
        <br />注意：告警↔工单联动受全局总闸 BINGOPS_ALERT_TICKET_ENABLED 控制，默认关闭（告警只落事件，不创建/流转工单）；开启后仍受规则「自动开单」细粒度控制。
      </a-alert>

      <a-table :data="rules" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #source="{ record }"><a-tag size="small" color="arcoblue">{{ record.source }}</a-tag></template>
        <template #rule="{ record }">
          <a-link @click="router.push({ name: 'AlertRuleEdit', params: { id: String(record.id) } })">{{ record.code }}</a-link>
          <div v-if="record.name" class="rule-name">{{ record.name }}</div>
        </template>
        <template #source_ref="{ record }">
          <a-tag v-if="record.source_id" size="small" color="cyan">{{ sourceName(record.source_id) }}</a-tag>
          <span v-else class="muted">未绑定</span>
        </template>
        <template #kind="{ record }">
          <a-tag size="small" :color="kindMeta(record.source_id).color">{{ kindMeta(record.source_id).text }}</a-tag>
        </template>
        <template #group="{ record }">{{ groupName(record.group_id) }}</template>
        <template #stale="{ record }">{{ record.stale_minutes }}</template>
        <template #schedule="{ record }">{{ scheduleText(record) }}</template>
        <template #severity="{ record }">{{ SEVERITY_MAP[record.default_severity]?.text || record.default_severity }}</template>
        <template #notify_enabled="{ record }">
          <a-tag size="small" :color="record.notify_enabled ? 'green' : 'gray'">{{ record.notify_enabled ? '开单' : '仅记录' }}</a-tag>
          <div v-if="record.notify_channel_id" class="ch-name">渠道：{{ channelName(record.notify_channel_id) }}</div>
          <div v-else class="muted">默认通知</div>
        </template>
        <template #enabled="{ record }">
          <a-tag size="small" :color="record.enabled ? 'green' : 'gray'">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button type="text" size="mini" @click="router.push({ name: 'AlertRuleEdit', params: { id: String(record.id) } })">编辑</a-button>
            <a-popconfirm content="删除后停止该规则的开单联动，事件保留。确定删除？" @ok="handleDelete(record.id)">
              <a-button type="text" size="mini" status="danger">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import { SEVERITY_MAP } from '../../api/alert'
import type { IAlertRule, IMonitoringSource, INotifyChannel } from '../../api/alert'
import * as metaApi from '../../api/ticketMeta'
import type { ITicketGroup } from '../../api/ticketMeta'

const router = useRouter()

const loading = ref(false)
const rules = ref<IAlertRule[]>([])
// 列表展示需要把 id 映射成名称（处理组/数据源/通知渠道），一次并发拉齐
const groups = ref<ITicketGroup[]>([])
const sources = ref<IMonitoringSource[]>([])
const channels = ref<INotifyChannel[]>([])

const columns = [
  { title: '告警来源', slotName: 'source', width: 100 },
  { title: '规则', slotName: 'rule', width: 220 },
  { title: '数据源', slotName: 'source_ref', width: 140 },
  { title: '类型', slotName: 'kind', width: 90 },
  { title: '处理组', slotName: 'group', width: 130 },
  { title: '执行频率 / 持续', slotName: 'schedule', width: 150 },
  { title: '恢复判定(分)', slotName: 'stale', width: 100 },
  { title: '告警分级', slotName: 'severity', width: 110 },
  { title: '行为', slotName: 'notify_enabled', width: 130 },
  { title: '状态', slotName: 'enabled', width: 70 },
  { title: '操作', slotName: 'actions', width: 100 },
]

function sourceName(id: number | null): string {
  if (!id) return ''
  return sources.value.find(s => s.id === id)?.name || `#${id}`
}

function channelName(id: number | null): string {
  if (!id) return ''
  return channels.value.find(c => c.id === id)?.name || `#${id}`
}

function groupName(gid: number | null): string {
  if (!gid) return '-'
  return groups.value.find(g => g.id === gid)?.name || `#${gid}`
}

// 调度概览：把后端存的轮次换算回夜莺同款的时间口径
function scheduleText(record: IAlertRule): string {
  return `每 ${record.eval_interval_seconds} 秒 / 连续 ${record.for_rounds * record.eval_interval_seconds} 秒`
}

// 双模型：rule_kind 由后端按绑定数据源 type 推导，前端同源展示（ClickHouse=日志型，其余=指标型）
function kindMeta(sourceId: number | null): { text: string; color: string } {
  if (!sourceId) return { text: '直报', color: 'gray' }
  const type = sources.value.find(s => s.id === sourceId)?.type
  if (type === 'clickhouse') return { text: '日志型', color: 'cyan' }
  if (type) return { text: '指标型', color: 'purple' }
  return { text: '未知源', color: 'gray' }
}

async function fetchData() {
  loading.value = true
  try { rules.value = (await alertApi.getAlertRules()).data } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

async function fetchAll() {
  await Promise.all([
    fetchData(),
    metaApi.getGroups().then(r => { groups.value = r.data }).catch(() => undefined),
    alertApi.getMonitoringSources().then(r => { sources.value = r.data }).catch(() => undefined),
    alertApi.getNotifyChannels().then(r => { channels.value = r.data }).catch(() => undefined),
  ])
}

async function handleDelete(id: number) {
  try { await alertApi.deleteAlertRule(id); Message.success('已删除'); fetchData() } catch { /* 拦截器已提示 */ }
}

onMounted(fetchAll)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.rule-tip { margin-bottom: $spacing-md; }
.rule-name { font-size: $font-size-xs; color: $text-hint; }
.muted { font-size: $font-size-xs; color: $text-disabled; }
.ch-name { font-size: $font-size-xs; color: $text-hint; }
</style>
