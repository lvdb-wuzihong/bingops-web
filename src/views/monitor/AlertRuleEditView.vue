<template>
  <div class="alert-rule-edit">
    <!-- 顶部操作条：sticky 常驻，长表单不必滚回顶部找保存 -->
    <div class="edit-bar">
      <a-button @click="goBack">
        <template #icon><icon-left /></template>返回规则列表
      </a-button>
      <div class="edit-bar-title">
        {{ isCreate ? '新增告警规则' : '编辑告警规则' }}
        <span v-if="!isCreate && formData.code" class="edit-bar-code">{{ formData.code }}</span>
      </div>
      <a-space>
        <a-button @click="goBack">取消</a-button>
        <a-button type="primary" :loading="saving" @click="handleSave">保存</a-button>
      </a-space>
    </div>

    <a-spin :loading="pageLoading" style="width: 100%">
      <a-row :gutter="16">
        <!-- ===== 左：表单主体 ===== -->
        <a-col :xs="24" :lg="17">
          <a-card title="基本信息" :bordered="false" class="form-card">
            <a-form :model="formData" layout="vertical">
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item field="code" label="规则 code" required tooltip="这条规则的唯一英文名（如 prod_5xx_error）：告警事件按它归组、统计也按它汇总，必须与执行器侧保持一致；创建后不可改">
                    <a-input v-model="formData.code" placeholder="英文小写+下划线，如 prod_5xx_error" :disabled="!isCreate" />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item field="name" label="规则名称">
                    <a-input v-model="formData.name" placeholder="可选，列表里给人看的中文名" />
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
                  <a-form-item field="group_id" label="开单处理组">
                    <a-select v-model="formData.group_id" placeholder="未选则跳过开单" allow-clear>
                      <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item field="notify_channel_id" label="通知渠道">
                    <a-select v-model="formData.notify_channel_id" placeholder="未选 = 通知由执行器默认处理" allow-clear>
                      <a-option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}（{{ c.type }}）</a-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item field="stale_minutes" label="恢复判定窗口（分钟）" tooltip="活跃告警多久没再收到同一规则的回报，就认为故障已自愈、自动标为已恢复并发恢复通知；建议设为执行频率的 2–3 倍，太小会因为执行器一次延迟就误报「已恢复」">
                    <a-input-number v-model="formData.stale_minutes" :min="1" hide-button style="width: 100%" />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-form-item label="行为开关">
                <a-space size="large">
                  <a-checkbox v-model="formData.notify_enabled">自动开单</a-checkbox>
                  <a-checkbox v-model="formData.enabled">启用该规则</a-checkbox>
                </a-space>
                <template #extra>
                  <span class="tip-line">「自动开单」仅在服务端总闸 BINGOPS_ALERT_TICKET_ENABLED 开启后生效；停用则该规则只落事件、不评估分发</span>
                </template>
              </a-form-item>
            </a-form>
          </a-card>

          <a-card title="评估配置" :bordered="false" class="form-card">
            <a-form :model="formData" layout="vertical">
              <a-form-item field="source_id" label="绑定数据源">
                <a-select v-model="formData.source_id" placeholder="未绑定 = 仅事件记录（webhook-only 规则）" allow-clear>
                  <a-option v-for="s in sources" :key="s.id" :value="s.id">{{ s.name }}（{{ s.type }}）</a-option>
                </a-select>
                <template #extra>
                  <!-- 双模型：rule_kind 由后端按数据源 type 推导定型，前端不传 -->
                  <span v-if="isLogRule" class="tip-line">日志规则（事件型）：每轮命中记一条流水，不合并、不自动开单</span>
                  <span v-else-if="selectedSourceType" class="tip-line">指标规则（状态型）：firing 合并续命、可恢复，支持自动开单</span>
                </template>
              </a-form-item>

              <!-- 按数据源类型联动：clickhouse=SQL 契约；victoria/prometheus=PromQL（非空即触发，阈值不参与） -->
              <template v-if="formData.source_id">
                <a-form-item
                  field="eval_sql"
                  :label="isLogRule ? '评估 SQL（ClickHouse）' : 'PromQL 表达式'"
                  :tooltip="isLogRule ? '执行器每轮拿去问数据库的那句话：查出来的错误数达到下面「命中阈值」就算一次告警。SQL 需返回两列——错误数与日志明细，{window_minutes} 会被替换成下面的查询窗口' : '执行器每轮拿去问指标库的表达式：比较条件直接写在表达式里（如 up == 0），只要查回来有数据就算一次告警，所以阈值不生效'"
                >
                  <a-textarea v-model="formData.eval_sql" :placeholder="evalSqlPlaceholder" :auto-size="{ minRows: 8, maxRows: 24 }" class="mono-input" />
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
                  <a-col :span="isLogRule ? 5 : 6">
                    <a-form-item field="eval_interval_seconds" label="执行频率(秒)" tooltip="执行器多久跑一次这条规则（夜莺同款「执行频率」）。60 = 每分钟查一次，也决定告警最多延迟多久被发现；调小更及时但会加大数据源压力（最小 10 秒）">
                      <a-input-number v-model="formData.eval_interval_seconds" :min="10" hide-button style="width: 100%" />
                    </a-form-item>
                  </a-col>
                  <a-col :span="6">
                    <a-form-item field="persist_seconds" label="持续时长(秒)" tooltip="要连续超标多久才真正报警（夜莺同款「持续时长」）。填 120 = 持续 2 分钟仍超标才通知，用来压掉偶发抖动；填 0 = 一轮命中就告。执行器按轮计数，所以实际时长按执行频率向上取整到整轮（见下方「实际生效」）">
                      <a-input-number v-model="formData.persist_seconds" :min="0" hide-button style="width: 100%" />
                    </a-form-item>
                  </a-col>
                  <a-col :span="isLogRule ? 5 : 6">
                    <a-form-item field="detail_limit" label="明细条数上限" tooltip="一条告警里最多带回多少行现场日志/指标样本，用于飞书卡片展示与事后排查。太大撑爆卡片、查询也变慢，太小看不清现场；事件表始终按结构化存储">
                      <a-input-number v-model="formData.detail_limit" :min="1" hide-button style="width: 100%" />
                    </a-form-item>
                  </a-col>
                  <!-- 重复提醒只对指标告警有意义（firing 会合并续命）；日志流水每轮独立直发 -->
                  <a-col v-if="!isLogRule" :span="6">
                    <a-form-item field="repeat_notify_minutes" label="重复提醒(分钟)" tooltip="告警一直不恢复时，每隔多久再提醒一次（夜莺 repeat notify 同款），防遗忘。默认 1 分钟；一旦有人在事件详情页「认领」，重复提醒自动静默（事件照常续命），直到恢复或放手">
                      <a-input-number v-model="formData.repeat_notify_minutes" :min="1" hide-button style="width: 100%" />
                    </a-form-item>
                  </a-col>
                </a-row>
                <p class="effective-line">{{ effectiveSummary }}</p>

                <a-row :gutter="16">
                  <a-col :span="12">
                    <a-form-item field="grafana_url" label="Grafana 跳转地址" tooltip="飞书卡片上的「查看图表」按钮，点开直接落到这条规则对应的面板">
                      <a-input v-model="formData.grafana_url" placeholder="可选，如 http://grafana.xxx/d/abc/prod?from=now-6h&to=now" />
                    </a-form-item>
                  </a-col>
                  <a-col :span="12">
                    <a-form-item field="cardTemplateText" label="飞书卡片模板（JSON，可选）" tooltip="只存配置数据，随分发下发给执行器，由执行器自行渲染发送；平台不解释结构">
                      <a-textarea v-model="formData.cardTemplateText" placeholder="可选；留空则用执行器默认卡片样式" :auto-size="{ minRows: 3, maxRows: 10 }" class="mono-input" />
                    </a-form-item>
                  </a-col>
                </a-row>
              </template>
              <p v-else class="tip-line">未绑定数据源：webhook-only 规则，事件由来源系统直接回报，无需评估配置。</p>

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
            </a-form>
          </a-card>

          <div class="edit-bar-bottom">
            <a-button @click="goBack">取消</a-button>
            <a-button type="primary" :loading="saving" @click="handleSave">保存</a-button>
          </div>
        </a-col>

        <!-- ===== 右：参数含义常驻栏（弹窗装不下，整页才放得开） ===== -->
        <a-col :xs="24" :lg="7">
          <a-card title="这些参数是什么意思" :bordered="false" class="term-card">
            <div v-for="t in TERM_GUIDE" :key="t.name" class="term-row">
              <div class="term-head">
                <b>{{ t.name }}</b>
                <span class="term-field">{{ t.field }}</span>
              </div>
              <p class="term-desc">{{ t.desc }}</p>
              <p class="term-where" :class="t.editable ? 'ok' : 'no'">{{ t.where }}</p>
            </div>
            <a-alert type="info" class="term-note">
              保存后由执行器按固定周期拉取配置，稍等片刻即生效；规则 code 改动需与执行器侧同步，否则事件会归到新 code 下。
            </a-alert>
          </a-card>
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconLeft, IconPlus, IconDelete } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import { SEVERITY_MAP } from '../../api/alert'
import type { IAlertRule, IMonitoringSource, INotifyChannel } from '../../api/alert'
import * as metaApi from '../../api/ticketMeta'
import type { ITicketGroup } from '../../api/ticketMeta'

const route = useRoute()
const router = useRouter()

// 后端无单规则 GET 端点，编辑态从规则列表里定位
const ruleId = Number(route.params.id) || null
const isCreate = computed(() => ruleId === null)

const pageLoading = ref(false)
const saving = ref(false)

const groups = ref<ITicketGroup[]>([])
const sources = ref<IMonitoringSource[]>([])
const channels = ref<INotifyChannel[]>([])

const formData = reactive({
  code: '', name: '',
  group_id: undefined as number | undefined, stale_minutes: 5, default_severity: 2,
  notify_enabled: true, enabled: true,
  // 规则级通知渠道；空 = 通知由执行器默认处理
  notify_channel_id: undefined as number | undefined,
  // ── 评估契约 ──
  source_id: undefined as number | undefined, eval_sql: '',
  threshold: 1, interval_minutes: 1, eval_interval_seconds: 60, detail_limit: 10,
  // 持续时长（秒）：UI 输入量，提交时换算为 for_rounds
  persist_seconds: 60,
  // 指标告警未恢复时的重复提醒间隔（分钟）；日志规则不读此字段
  repeat_notify_minutes: 1,
  grafana_url: '', cardTemplateText: '',
})
const labelRows = ref<Array<{ k: string; v: string }>>([])

// 绑定数据源的类型：决定评估输入形态（clickhouse=SQL 契约；victoria/prometheus=PromQL）
const selectedSourceType = computed(() =>
  sources.value.find(s => s.id === formData.source_id)?.type ?? null,
)
// 日志规则（ClickHouse）才有「查询窗口 / 命中阈值」；指标源两者不参与（窗口与比较都写在 PromQL 里），隐藏而非置灰
const isLogRule = computed(() => selectedSourceType.value === 'clickhouse')

const evalSqlPlaceholder = computed(() =>
  isLogRule.value
    ? '契约：单行两列 error_count + log_details；窗口占位 {window_minutes}'
    : '表达式自带比较（如 up == 0、rate(err[5m]) > 10），查询结果非空即触发',
)

// 夜莺式「持续时长」交互：UI 收秒数，提交换算成后端 for_rounds（按执行频率向上取整到整轮）
const effectiveRounds = computed(() => {
  const interval = formData.eval_interval_seconds || 60
  return Math.max(1, Math.ceil((formData.persist_seconds || 0) / interval))
})
const effectiveSeconds = computed(() => effectiveRounds.value * (formData.eval_interval_seconds || 60))
const effectiveSummary = computed(() => {
  const parts = [`每 ${formData.eval_interval_seconds} 秒查一次`, `连续 ${effectiveSeconds.value} 秒（${effectiveRounds.value} 轮）超标才报警`]
  if (isLogRule.value) {
    parts.push(`每轮回看最近 ${formData.interval_minutes} 分钟，每轮命中直发不节流`)
  } else {
    parts.push('回看窗口由表达式自身决定', `未恢复则每 ${formData.repeat_notify_minutes} 分钟重复提醒（认领后静默）`)
  }
  return `实际生效：${parts.join('，')}`
})

// 概念对照：把夜莺/业界叫法映射到本平台字段。editable=false 的三项是后端无字段/无能力项，只解释不造假控件。
// 依据（已核对 alert_service.py）：REPEAT_NOTIFY_MINUTES = 1 经 webhook 响应 repeat_after_minutes 下发；
// agent 配置 notify_interval_minutes = 15 为平台不可用时执行器兜底限流；无「留观时长」「最大发送次数」对应字段。
const TERM_GUIDE: Array<{ name: string; field: string; desc: string; where: string; editable: boolean }> = [
  {
    name: '执行频率', field: 'eval_interval_seconds', editable: true,
    desc: '执行器每隔多久去数据源查一次。60 秒 = 每分钟问一次；它也决定了告警最多延迟多久被发现。',
    where: '本页可配（秒，最小 10）',
  },
  {
    name: '查询窗口', field: 'interval_minutes', editable: true,
    desc: '每轮往回看多长时间的数据，填 5 = 只查最近 5 分钟的日志。只有日志规则用得到；指标源请把窗口写进 PromQL（如 [5m]）。',
    where: '本页可配（分钟，仅 ClickHouse 日志规则）',
  },
  {
    name: '命中阈值', field: 'threshold', editable: true,
    desc: '一轮查出多少条错误才算“超标”。1 = 出现一条就算；10 = 凑够 10 条才算，用来过滤零星噪音。',
    where: '本页可配（仅日志规则；指标源的比较写在表达式里，此值不参与）',
  },
  {
    name: '持续时长', field: 'for_rounds × 执行频率', editable: true,
    desc: '要连续超标多久才真正报出告警（夜莺同款）。120 秒 = 持续 2 分钟仍超标才通知，用来压掉“偶发一次就告”的噪音。',
    where: '本页可配（秒）；后端按轮计数，实际时长按执行频率向上取整到整轮',
  },
  {
    name: '明细条数上限', field: 'detail_limit', editable: true,
    desc: '一条告警里最多附带多少行现场日志/指标样本，给飞书卡片和事后排查看。太大撑爆卡片、太小看不清现场。',
    where: '本页可配（条）',
  },
  {
    name: '恢复判定窗口', field: 'stale_minutes', editable: true,
    desc: '活跃告警多久没再收到同一规则的回报，平台就认为故障已自愈、自动标为已恢复并发恢复通知。',
    where: '本页可配（分钟），建议为执行频率的 2–3 倍',
  },
  {
    name: '留观时长', field: '无对应字段', editable: false,
    desc: '夜莺概念：判定恢复后再观察 N 秒才发恢复通知，防止状态在恢复/告警之间来回弹时刷屏。',
    where: '本平台无此开关——同类防抖由「恢复判定窗口」承担（方向相反：它是“还要等多久才算恢复”）',
  },
  {
    name: '重复通知间隔', field: 'repeat_notify_minutes', editable: true,
    desc: '告警一直不恢复时，每隔多久再提醒一次（夜莺 repeat notify 同款），防遗忘。默认 1 分钟；太小会变成刷屏，太大容易遗忘。',
    where: '本页可配（分钟，仅指标告警）；日志流水每轮直发不读此字段。一旦在事件详情页「认领」，重复提醒自动静默（事件照常续命）',
  },
  {
    name: '最大发送次数', field: '无对应字段', editable: false,
    desc: '同一条告警最多重复提醒几次后彻底闭嘴。',
    where: '本平台无对应能力（后端无字段）：持续未恢复会按上面的间隔一直提醒',
  },
]

function fillFromRule(rule: IAlertRule) {
  Object.assign(formData, {
    code: rule.code,
    name: rule.name ?? '',
    group_id: rule.group_id ?? undefined,
    stale_minutes: rule.stale_minutes,
    default_severity: rule.default_severity,
    notify_enabled: rule.notify_enabled,
    enabled: rule.enabled,
    notify_channel_id: rule.notify_channel_id ?? undefined,
    source_id: rule.source_id ?? undefined,
    eval_sql: rule.eval_sql ?? '',
    threshold: rule.threshold,
    interval_minutes: rule.interval_minutes,
    eval_interval_seconds: rule.eval_interval_seconds,
    // 后端只存轮次，回显乘回秒数供用户按时间理解
    persist_seconds: rule.for_rounds * rule.eval_interval_seconds,
    detail_limit: rule.detail_limit,
    repeat_notify_minutes: rule.repeat_notify_minutes ?? 1,
    grafana_url: rule.grafana_url ?? '',
    cardTemplateText: rule.feishu_card_template ? JSON.stringify(rule.feishu_card_template, null, 2) : '',
  })
  labelRows.value = Object.entries(rule.static_labels ?? {}).map(([k, v]) => ({ k, v: String(v) }))
}

function buildLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of labelRows.value) {
    if (r.k.trim()) out[r.k.trim()] = r.v
  }
  return out
}

function goBack() {
  router.push('/monitor/rules')
}

async function handleSave() {
  if (!formData.code.trim()) { Message.warning('规则 code 必填'); return }
  // 飞书卡片模板：可选 JSON，非法拦截
  let cardTemplate: Record<string, unknown> | null = null
  if (formData.cardTemplateText.trim()) {
    try { cardTemplate = JSON.parse(formData.cardTemplateText) } catch { Message.warning('飞书卡片模板不是合法 JSON'); return }
  }
  const payload = {
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
    repeat_notify_minutes: formData.repeat_notify_minutes,
    grafana_url: formData.grafana_url || null,
    feishu_card_template: cardTemplate,
  }
  saving.value = true
  try {
    if (ruleId) {
      await alertApi.updateAlertRule(ruleId, payload)
      Message.success('已更新')
    } else {
      // 夜莺退役后规则为平台原生，来源固定 bingops
      await alertApi.createAlertRule({ source: 'bingops', code: formData.code.trim(), ...payload })
      Message.success('已创建')
    }
    goBack()
  } catch { /* 拦截器已提示（如 code 重复） */ } finally { saving.value = false }
}

onMounted(async () => {
  pageLoading.value = true
  try {
    const [gs, ss, cs] = await Promise.all([
      metaApi.getGroups().catch(() => null),
      alertApi.getMonitoringSources().catch(() => null),
      alertApi.getNotifyChannels().catch(() => null),
    ])
    groups.value = gs?.data ?? []
    sources.value = ss?.data ?? []
    channels.value = cs?.data ?? []
    if (ruleId) {
      // 无单规则端点：从列表定位；刷新进来时列表已含该规则
      const list = await alertApi.getAlertRules()
      const hit = list.data.find(r => r.id === ruleId)
      if (hit) fillFromRule(hit)
      else Message.error('规则不存在或已被删除')
    }
  } finally { pageLoading.value = false }
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.edit-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-md;
  margin-bottom: $spacing-md;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}
.edit-bar-title {
  flex: 1;
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}
.edit-bar-code {
  margin-left: $spacing-sm;
  padding: 2px 8px;
  font-size: $font-size-xs;
  font-family: $font-mono;
  color: $color-primary;
  background: rgba(22, 119, 255, 0.08);
  border-radius: 10px;
}
.form-card {
  margin-bottom: $spacing-md;
  :deep(.arco-form-item) { margin-bottom: $spacing-md; }
}
.edit-bar-bottom {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}
.tip-line { font-size: $font-size-xs; color: $text-hint; line-height: 1.6; }
.effective-line {
  margin: -4px 0 $spacing-md;
  padding: 6px 10px;
  font-size: $font-size-xs;
  color: $text-hint;
  background: rgba(22, 119, 255, 0.04);
  border-radius: $radius-sm;
}
.mono-input { font-family: $font-mono; }
.label-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .label-row { display: flex; gap: $spacing-xs; align-items: center; .arco-input-wrapper { flex: 1; } }
}

// 右侧常驻说明栏：跟随滚动，长表单里随时可查
.term-card {
  position: sticky;
  top: 72px;
  :deep(.arco-card-header) { border-bottom: 1px solid $border-color-light; }
}
.term-row {
  padding: 6px 0;
  & + .term-row { border-top: 1px dashed $border-color-light; }
}
.term-head {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  b { font-size: $font-size-sm; color: $text-primary; }
}
.term-field { font-size: $font-size-xs; color: $text-hint; font-family: $font-mono; }
.term-desc { margin: 2px 0; font-size: $font-size-xs; color: $text-body; line-height: 1.6; }
.term-where {
  margin: 0;
  font-size: $font-size-xs;
  line-height: 1.6;
  &.ok { color: $text-hint; }
  &.no { color: $color-warning; }
}
.term-note { margin-top: $spacing-sm; font-size: $font-size-xs; }
</style>
