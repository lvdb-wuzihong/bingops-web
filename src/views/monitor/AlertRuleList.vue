<template>
  <div class="alert-rule-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">告警规则</span>
        <a-space>
          <a-button type="primary" size="small" @click="openRuleModal(null)">
            <template #icon><icon-plus /></template>新增规则
          </a-button>
          <a-button size="small" @click="fetchRules">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="rule-tip" type="info">
        规则决定告警的开单去向与评估方式：平台定义规则、执行器消费（rule_code 是事件聚合与统计的键）；绑定数据源与评估表达式后由执行器按节拍评估（二期分发）；未配置规则的告警事件照常落库，但跳过自动开单。
        <br />注意：告警↔工单联动受全局总闸 BINGOPS_ALERT_TICKET_ENABLED 控制，默认关闭（告警只落事件，不创建/流转工单）；开启后仍受下方「自动开单」细粒度控制。
      </a-alert>

      <a-table :data="rules" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #source="{ record }"><a-tag size="small" color="arcoblue">{{ record.source }}</a-tag></template>
        <template #rule="{ record }">
          <span class="rule-code">{{ record.code }}</span>
          <div v-if="record.name" class="rule-name">{{ record.name }}</div>
        </template>
        <template #source_ref="{ record }">
          <a-tag v-if="record.source_id" size="small" color="cyan">{{ sourceName(record.source_id) }}</a-tag>
          <span v-else class="no-source">未绑定</span>
        </template>
        <template #group="{ record }">{{ groupName(record.group_id) }}</template>
        <template #stale="{ record }">{{ record.stale_minutes }}</template>
        <template #severity="{ record }">{{ SEVERITY_MAP[record.default_severity]?.text || record.default_severity }}</template>
        <template #notify_enabled="{ record }">
          <a-tag size="small" :color="record.notify_enabled ? 'green' : 'gray'">{{ record.notify_enabled ? '开单' : '仅记录' }}</a-tag>
          <div v-if="record.notify_channel_id" class="ch-name">渠道：{{ channelName(record.notify_channel_id) }}</div>
          <div v-else class="no-source">默认通知</div>
        </template>
        <template #enabled="{ record }">
          <a-tag size="small" :color="record.enabled ? 'green' : 'gray'">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button type="text" size="mini" @click="openRuleModal(record)">编辑</a-button>
            <a-popconfirm content="删除后停止该规则的开单联动，事件保留。确定删除？" @ok="handleDelete(record.id)">
              <a-button type="text" size="mini" status="danger">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑规则' : '新增规则'" :width="640" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <!-- 夜莺退役后规则为平台原生：来源固定 bingops（过渡期历史数据在列表「告警来源」列区分） -->
        <a-form-item field="code" label="规则 code" required tooltip="这条规则的唯一英文名（如 prod_5xx_error）：告警事件按它归组、统计也按它汇总，必须与执行器侧保持一致；创建后不可改">
          <a-input v-model="formData.code" placeholder="英文小写+下划线，如 prod_5xx_error" :disabled="!!editingId" />
        </a-form-item>
        <a-form-item field="name" label="规则名称"><a-input v-model="formData.name" placeholder="可选，列表里给人看的中文名" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="group_id" label="开单处理组">
              <a-select v-model="formData.group_id" placeholder="未选则跳过开单" allow-clear>
                <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="stale_minutes" label="恢复判定窗口（分钟）">
              <a-input-number v-model="formData.stale_minutes" :min="1" hide-button style="width: 100%" />
              <template #extra>
                <span class="switch-tip">活跃告警多久没再收到同一规则的回报，就认为故障已自愈、自动标为已恢复并发恢复通知；建议设为执行频率的 2–3 倍，太小会因为执行器一次延迟就误报「已恢复」</span>
              </template>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="default_severity" label="告警分级" tooltip="事件本身没带级别时按这里兜底；与夜莺同口径（一级最重），会写进事件与飞书卡片">
              <a-select v-model="formData.default_severity">
                <a-option v-for="(m, k) in SEVERITY_MAP" :key="k" :value="Number(k)">{{ m.full }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="行为开关">
              <a-space size="medium">
                <a-checkbox v-model="formData.notify_enabled">自动开单</a-checkbox>
                <a-checkbox v-model="formData.enabled">启用</a-checkbox>
              </a-space>
              <template #extra>
                <span class="switch-tip">「自动开单」仅在服务端总闸开启后生效</span>
              </template>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item field="notify_channel_id" label="通知渠道">
          <a-select v-model="formData.notify_channel_id" placeholder="未选 = 通知由执行器默认处理" allow-clear>
            <a-option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}（{{ c.type }}）</a-option>
          </a-select>
        </a-form-item>
        <a-divider orientation="left">评估配置（执行器按此巡检）</a-divider>
        <a-form-item field="source_id" label="绑定数据源">
          <a-select v-model="formData.source_id" placeholder="未绑定 = 仅事件记录（webhook-only 规则）" allow-clear>
            <a-option v-for="s in sources" :key="s.id" :value="s.id">{{ s.name }}（{{ s.type }}）</a-option>
          </a-select>
          <template #extra>
            <!-- 双模型：rule_kind 由后端按数据源 type 推导定型，前端不传 -->
            <span v-if="selectedSourceType === 'clickhouse'" class="switch-tip">ClickHouse 源 → 日志规则（事件型）：每轮命中记一条流水，不合并、不自动开单</span>
            <span v-else-if="selectedSourceType" class="switch-tip">指标源 → 指标规则（状态型）：firing 合并续命、可恢复，支持自动开单</span>
          </template>
        </a-form-item>
        <!-- 按数据源类型联动：clickhouse=SQL 契约；victoria/prometheus=PromQL（vector 非空即触发，阈值不参与）；未绑定=评估区折叠 -->
        <template v-if="formData.source_id">
          <a-form-item
            field="eval_sql"
            :label="selectedSourceType === 'clickhouse' ? '评估 SQL（ClickHouse）' : 'PromQL 表达式'"
            :tooltip="selectedSourceType === 'clickhouse' ? '执行器每轮拿去问数据库的那句话：查出来的错误数达到下面「命中阈值」就算一次告警。SQL 需返回两列——错误数与日志明细，{window_minutes} 会被替换成下面的查询窗口' : '执行器每轮拿去问指标库的表达式：比较条件直接写在表达式里（如 up == 0），只要查回来有数据就算一次告警，所以下面阈值不生效'"
          >
            <a-textarea v-model="formData.eval_sql" :placeholder="evalSqlPlaceholder" :auto-size="{ minRows: 3, maxRows: 8 }" />
          </a-form-item>
          <a-row :gutter="16">
            <a-col v-if="isLogRule" :span="4">
              <a-form-item field="interval_minutes" label="查询窗口(分钟)" tooltip="每轮往回看多长时间的数据，即 SQL 里 {window_minutes} 的值。填 5 = 每次检查最近 5 分钟的日志">
                <a-input-number v-model="formData.interval_minutes" :min="1" hide-button style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col v-if="isLogRule" :span="4">
              <a-form-item field="threshold" label="命中阈值" tooltip="查出来的错误数 ≥ 该值才算一次告警。填 1 = 出现一条日志就告；填 10 = 一轮里凑够 10 条才告，用来过滤零星噪音">
                <a-input-number v-model="formData.threshold" :min="1" hide-button style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="isLogRule ? 5 : 8">
              <a-form-item field="eval_interval_seconds" label="执行频率(秒)" tooltip="执行器多久跑一次这条规则（夜莺同款「执行频率」）。60 = 每分钟查一次，也决定告警最多延迟多久被发现；调小更及时但会加大数据源压力（最小 10 秒）">
                <a-input-number v-model="formData.eval_interval_seconds" :min="10" hide-button style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="isLogRule ? 6 : 8">
              <a-form-item field="persist_seconds" label="持续时长(秒)" tooltip="要连续超标多久才真正报警（夜莺同款「持续时长」）。填 120 = 持续 2 分钟仍超标才通知，用来压掉偶发抖动；填 0 = 一轮命中就告。执行器按轮计数，所以实际时长按执行频率向上取整到整轮（见下方「实际生效」）">
                <a-input-number v-model="formData.persist_seconds" :min="0" hide-button style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="isLogRule ? 5 : 8">
              <a-form-item field="detail_limit" label="明细条数上限" tooltip="一条告警里最多带回多少行现场日志/指标样本，用于飞书卡片展示与事后排查。太大撑爆卡片、查询也变慢，太小看不清现场；事件表始终按结构化存储">
                <a-input-number v-model="formData.detail_limit" :min="1" hide-button style="width: 100%" />
              </a-form-item>
            </a-col>
          </a-row>
          <p class="eval-effective">{{ effectiveSummary }}</p>
        </template>
        <p v-else class="no-source-hint">未绑定数据源：webhook-only 规则，事件由来源系统直接回报，无需评估配置。</p>
        <a-form-item field="grafana_url" label="Grafana 跳转地址">
          <a-input v-model="formData.grafana_url" placeholder="可选，卡片内毫秒级跳转" />
        </a-form-item>
        <a-form-item field="cardTemplateText" label="飞书卡片模板（JSON，可选）">
          <a-textarea v-model="formData.cardTemplateText" placeholder="可选；配置数据随分发下发给执行器，由执行器自行渲染发送" :auto-size="{ minRows: 3, maxRows: 10 }" />
        </a-form-item>
        <a-form-item label="静态 labels" tooltip="给这条规则固定补充的标签（如 env=prod）：事件本身没带时就按这里补齐，用来做环境/业务区分与告警屏蔽的匹配依据">
          <div class="label-editor">
            <div v-for="(row, idx) in labelRows" :key="idx" class="label-row">
              <a-input v-model="row.k" placeholder="key，如 env" />
              <a-input v-model="row.v" placeholder="value" />
              <a-button type="text" status="danger" @click="labelRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button>
            </div>
            <a-button type="dashed" size="small" @click="labelRows.push({ k: '', v: '' })">
              <template #icon><icon-plus /></template>添加 label
            </a-button>
          </div>
        </a-form-item>
        <!-- 概念对照：把夜莺/业界叫法与本平台字段一次讲清，含平台不支持项（避免对着夜莺找不存在的开关） -->
        <div class="term-toggle" @click="termsOpen = !termsOpen">
          <icon-right class="term-chev" :class="{ open: termsOpen }" />
          <span class="term-label">这些参数分别是什么意思？</span>
          <span class="term-sub">执行频率 / 持续时长 / 留观时长 / 重复通知间隔 / 最大发送次数</span>
        </div>
        <div v-show="termsOpen" class="term-body">
          <div v-for="t in TERM_GUIDE" :key="t.name" class="term-row">
            <div class="term-head">
              <b>{{ t.name }}</b>
              <span class="term-field">{{ t.field }}</span>
            </div>
            <p class="term-desc">{{ t.desc }}</p>
            <p class="term-where" :class="t.editable ? 'ok' : 'no'">{{ t.where }}</p>
          </div>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconDelete, IconRefresh, IconRight } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import { SEVERITY_MAP } from '../../api/alert'
import type { IAlertRule, IMonitoringSource, INotifyChannel } from '../../api/alert'
import * as metaApi from '../../api/ticketMeta'
import type { ITicketGroup } from '../../api/ticketMeta'

// 概念对照表：把夜莺/业界叫法映射到本平台字段。editable=false 的三项是后端无字段/无能力的项，只解释不造假控件。
// 依据（已核对 alert_service.py）：REPEAT_NOTIFY_MINUTES = 1 经 webhook 响应 repeat_after_minutes 下发；
// agent 配置 notify_interval_minutes = 15 为平台不可用时执行器兜底限流；无「留观时长」「最大发送次数」对应字段。
const TERM_GUIDE: Array<{ name: string; field: string; desc: string; where: string; editable: boolean }> = [
  {
    name: '执行频率', field: 'eval_interval_seconds', editable: true,
    desc: '执行器每隔多久去数据源查一次。60 秒 = 每分钟问一次；它也决定了告警最多延迟多久被发现。',
    where: '本表单可配（秒，最小 10）',
  },
  {
    name: '查询窗口', field: 'interval_minutes', editable: true,
    desc: '每轮往回看多长时间的数据，填 5 = 只查最近 5 分钟的日志。只有日志规则用得到；指标源请把窗口写进 PromQL（如 [5m]）。',
    where: '本表单可配（分钟，仅 ClickHouse 日志规则）',
  },
  {
    name: '命中阈值', field: 'threshold', editable: true,
    desc: '一轮查出多少条错误才算“超标”。1 = 出现一条就算；10 = 凑够 10 条才算，用来过滤零星噪音。',
    where: '本表单可配（仅日志规则；指标源的比较写在表达式里，此值不参与）',
  },
  {
    name: '持续时长', field: 'for_rounds × 执行频率', editable: true,
    desc: '要连续超标多久才真正报出告警（夜莺同款）。120 秒 = 持续 2 分钟仍超标才通知，用来压掉“偶发一次就告”的噪音。',
    where: '本表单可配（秒）；后端按轮计数，所以实际时长按执行频率向上取整到整轮',
  },
  {
    name: '明细条数上限', field: 'detail_limit', editable: true,
    desc: '一条告警里最多附带多少行现场日志/指标样本，给飞书卡片和事后排查看。太大撑爆卡片、太小看不清现场。',
    where: '本表单可配（条）',
  },
  {
    name: '恢复判定窗口', field: 'stale_minutes', editable: true,
    desc: '活跃告警多久没再收到同一规则的回报，平台就认为故障已自愈、自动标为已恢复并发恢复通知。',
    where: '本表单可配（分钟），建议为执行频率的 2–3 倍',
  },
  {
    name: '留观时长', field: '无对应字段', editable: false,
    desc: '夜莺概念：判定恢复后再观察 N 秒才发恢复通知，防止状态在恢复/告警之间来回弹时刷屏。',
    where: '本平台无此开关——同类防抖由上面的「恢复判定窗口」承担（方向相反：它是“还要等多久才算恢复”）',
  },
  {
    name: '重复通知间隔', field: 'repeat_after_minutes（平台常量）', editable: false,
    desc: '告警一直不恢复时，每隔多久再提醒一次，避免要么石沉大海要么刷屏。',
    where: '不可配：平台在每次 webhook 响应里固定下发 1 分钟；执行器另有 15 分钟限流兜底（仅平台不可用时生效）。要改需后端提常量',
  },
  {
    name: '最大发送次数', field: '无对应字段', editable: false,
    desc: '同一条告警最多重复提醒几次后彻底闭嘴。',
    where: '本平台无对应能力（后端无字段）：持续未恢复会按上面的间隔一直提醒',
  },
]

const loading = ref(false)
const rules = ref<IAlertRule[]>([])
const groups = ref<ITicketGroup[]>([])
// 二期：评估契约绑定的监控数据源
const sources = ref<IMonitoringSource[]>([])

function sourceName(id: number | null): string {
  if (!id) return ''
  return sources.value.find(s => s.id === id)?.name || `#${id}`
}

async function fetchSources() {
  try { sources.value = (await alertApi.getMonitoringSources()).data } catch { /* ignore */ }
}

// 绑定数据源的类型：决定评估输入形态（clickhouse=SQL 契约；victoria/prometheus=PromQL）与阈值是否参与
const selectedSourceType = computed(() =>
  sources.value.find(s => s.id === formData.source_id)?.type ?? null,
)

const evalSqlPlaceholder = computed(() =>
  selectedSourceType.value === 'clickhouse'
    ? '契约：单行两列 error_count + log_details；窗口占位 {window_minutes}'
    : '表达式自带比较（如 up == 0、rate(err[5m]) > 10），查询结果非空即触发',
)

// 日志规则（ClickHouse）才有「查询窗口 / 命中阈值」；指标源两者不参与（窗口与比较都写在 PromQL 里），隐藏而非置灰，避免误以为生效
const isLogRule = computed(() => selectedSourceType.value === 'clickhouse')

// 夜莺式「持续时长」交互：UI 收秒数，提交换算成后端 for_rounds（按执行频率向上取整到整轮）
const effectiveRounds = computed(() => {
  const interval = formData.eval_interval_seconds || 60
  return Math.max(1, Math.ceil((formData.persist_seconds || 0) / interval))
})
const effectiveSeconds = computed(() => effectiveRounds.value * (formData.eval_interval_seconds || 60))
const effectiveSummary = computed(() => {
  const parts = [`每 ${formData.eval_interval_seconds} 秒查一次`, `连续 ${effectiveSeconds.value} 秒（${effectiveRounds.value} 轮）超标才报警`]
  parts.push(isLogRule.value ? `每轮回看最近 ${formData.interval_minutes} 分钟` : '回看窗口由表达式自身决定')
  return `实际生效：${parts.join('，')}`
})

// 二期：规则级绑定的通知渠道
const channels = ref<INotifyChannel[]>([])

function channelName(id: number | null): string {
  if (!id) return ''
  return channels.value.find(c => c.id === id)?.name || `#${id}`
}

async function fetchChannels() {
  try { channels.value = (await alertApi.getNotifyChannels()).data } catch { /* ignore */ }
}

const columns = [
  { title: '告警来源', slotName: 'source', width: 110 },
  { title: '规则', slotName: 'rule', width: 220 },
  { title: '数据源', slotName: 'source_ref', width: 110 },
  { title: '处理组', slotName: 'group', width: 130 },
  { title: '恢复判定(分)', slotName: 'stale', width: 100 },
  { title: '告警分级', slotName: 'severity', width: 110 },
  { title: '行为', slotName: 'notify_enabled', width: 80 },
  { title: '状态', slotName: 'enabled', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

function groupName(gid: number | null): string {
  if (!gid) return '-'
  return groups.value.find(g => g.id === gid)?.name || `#${gid}`
}

async function fetchRules() {
  loading.value = true
  try { rules.value = (await alertApi.getAlertRules()).data } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

async function fetchGroups() {
  try { groups.value = (await metaApi.getGroups()).data } catch { /* ignore */ }
}

// ---------- 表单 ----------

const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
// 概念对照表展开（每次打开弹窗重置为收起）
const termsOpen = ref(false)
const formData = reactive({
  code: '', name: '',
  group_id: undefined as number | undefined, stale_minutes: 5, default_severity: 2,
  notify_enabled: true, enabled: true,
  // 规则级通知渠道；空 = 通知由执行器默认处理
  notify_channel_id: undefined as number | undefined,
  // ── 二期：评估契约 ──
  source_id: undefined as number | undefined, eval_sql: '',
  threshold: 1, interval_minutes: 1, eval_interval_seconds: 60, detail_limit: 10,
  // 持续时长（秒）：UI 输入量，提交时换算为 for_rounds
  persist_seconds: 60,
  grafana_url: '', cardTemplateText: '',
})
const labelRows = ref<Array<{ k: string; v: string }>>([])

function buildLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of labelRows.value) {
    if (r.k.trim()) out[r.k.trim()] = r.v
  }
  return out
}

function openRuleModal(rule: IAlertRule | null) {
  editingId.value = rule?.id ?? null
  Object.assign(formData, {
    code: rule?.code ?? '',
    name: rule?.name ?? '',
    group_id: rule?.group_id ?? undefined,
    stale_minutes: rule?.stale_minutes ?? 5,
    default_severity: rule?.default_severity ?? 2,
    notify_enabled: rule?.notify_enabled ?? true,
    enabled: rule?.enabled ?? true,
  })
  labelRows.value = Object.entries(rule?.static_labels ?? {}).map(([k, v]) => ({ k, v }))
  // 通知渠道 + 二期评估契约回显
  Object.assign(formData, {
    notify_channel_id: rule?.notify_channel_id ?? undefined,
    source_id: rule?.source_id ?? undefined,
    eval_sql: rule?.eval_sql ?? '',
    threshold: rule?.threshold ?? 1,
    interval_minutes: rule?.interval_minutes ?? 1,
    eval_interval_seconds: rule?.eval_interval_seconds ?? 60,
    // 后端只存轮次，回显乘回秒数供用户按时间理解
    persist_seconds: (rule?.for_rounds ?? 1) * (rule?.eval_interval_seconds ?? 60),
    detail_limit: rule?.detail_limit ?? 10,
    grafana_url: rule?.grafana_url ?? '',
    cardTemplateText: rule?.feishu_card_template ? JSON.stringify(rule.feishu_card_template, null, 2) : '',
  })
  formVisible.value = true
  termsOpen.value = false
}

async function handleSubmit() {
  if (!formData.code.trim()) { Message.warning('规则 code 必填'); return }
  // 飞书卡片模板：可选 JSON，非法拦截
  let cardTemplate: Record<string, unknown> | null = null
  if (formData.cardTemplateText.trim()) {
    try { cardTemplate = JSON.parse(formData.cardTemplateText) } catch { Message.warning('飞书卡片模板不是合法 JSON'); return }
  }
  formLoading.value = true
  try {
    if (editingId.value) {
      await alertApi.updateAlertRule(editingId.value, {
        name: formData.name || null,
        group_id: formData.group_id ?? null,
        stale_minutes: formData.stale_minutes,
        default_severity: formData.default_severity,
        static_labels: buildLabels(),
        notify_enabled: formData.notify_enabled,
        enabled: formData.enabled,
        notify_channel_id: formData.notify_channel_id ?? null,
        source_id: formData.source_id ?? null,
        eval_sql: formData.eval_sql || null,
        threshold: formData.threshold,
        interval_minutes: formData.interval_minutes,
        eval_interval_seconds: formData.eval_interval_seconds,
        for_rounds: effectiveRounds.value,
        detail_limit: formData.detail_limit,
        grafana_url: formData.grafana_url || null,
        feishu_card_template: cardTemplate,
      })
      Message.success('已更新')
    } else {
      await alertApi.createAlertRule({
        // 夜莺退役后规则为平台原生，来源固定 bingops
        source: 'bingops', code: formData.code.trim(),
        name: formData.name || null,
        group_id: formData.group_id ?? null,
        stale_minutes: formData.stale_minutes,
        default_severity: formData.default_severity,
        static_labels: buildLabels(),
        notify_enabled: formData.notify_enabled,
        enabled: formData.enabled,
        notify_channel_id: formData.notify_channel_id ?? null,
        source_id: formData.source_id ?? null,
        eval_sql: formData.eval_sql || null,
        threshold: formData.threshold,
        interval_minutes: formData.interval_minutes,
        eval_interval_seconds: formData.eval_interval_seconds,
        for_rounds: effectiveRounds.value,
        detail_limit: formData.detail_limit,
        grafana_url: formData.grafana_url || null,
        feishu_card_template: cardTemplate,
      })
      Message.success('已创建')
    }
    formVisible.value = false
    fetchRules()
  } catch { /* 拦截器已提示（如 code 重复） */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await alertApi.deleteAlertRule(id); Message.success('已删除'); fetchRules() } catch { /* 拦截器已提示 */ }
}

onMounted(() => {
  fetchRules()
  fetchGroups()
  fetchSources()
  fetchChannels()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.rule-tip { margin-bottom: $spacing-md; }
.rule-code { font-weight: 500; color: $text-primary; }
.rule-name { font-size: $font-size-xs; color: $text-secondary; }
.no-source { font-size: $font-size-xs; color: $text-disabled; }
.switch-tip { font-size: $font-size-xs; color: $text-hint; }
.eval-effective { margin: -4px 0 $spacing-sm; font-size: $font-size-xs; color: $text-hint; }
.ch-name { font-size: $font-size-xs; color: $text-secondary; }
.label-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .label-row { display: flex; gap: $spacing-xs; align-items: center; .arco-input-wrapper { flex: 1; } }
}

// 概念对照表：自控展开（不用 a-collapse，避开折叠头 padding 压字问题）
.term-toggle {
  display: flex; align-items: center; gap: 6px; margin-top: $spacing-sm;
  padding: 8px 12px; cursor: pointer; border-radius: $radius-sm;
  background: rgba(22, 119, 255, 0.04); border: 1px solid $border-color-light;
  &:hover { background: rgba(22, 119, 255, 0.08); }
}
.term-chev {
  flex-shrink: 0; font-size: $font-size-xs; color: $text-hint;
  transition: transform 0.2s;
  &.open { transform: rotate(90deg); }
}
.term-label { font-size: $font-size-sm; font-weight: 600; color: $text-primary; }
.term-sub { font-size: $font-size-xs; color: $text-hint; }
.term-body {
  margin-top: 6px; padding: $spacing-xs $spacing-sm; border-radius: $radius-sm;
  border: 1px solid $border-color-light;
}
.term-row {
  padding: 6px 0;
  & + .term-row { border-top: 1px dashed $border-color-light; }
}
.term-head {
  display: flex; align-items: baseline; gap: 8px;
  b { font-size: $font-size-sm; color: $text-primary; }
}
.term-field { font-size: $font-size-xs; color: $text-hint; font-family: $font-mono; }
.term-desc { margin: 2px 0; font-size: $font-size-xs; color: $text-body; line-height: 1.6; }
.term-where {
  margin: 0; font-size: $font-size-xs;
  &.ok { color: $text-hint; }
  &.no { color: $color-warning; }
}
</style>
