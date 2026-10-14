<template>
  <a-modal v-model:visible="visProxy" :title="editing ? '编辑屏蔽规则' : '新建屏蔽规则'" :width="620" :ok-loading="saving" @ok="handleSave">
    <a-form :model="form" layout="vertical">
      <a-alert class="mute-tip" type="info">
        时间窗内命中的告警事件<b>照常落库</b>，仅抑制飞书通知（metric 合并 firing 与 log 流水均生效）；恢复绿卡不受屏蔽控制。留空范围字段即放大屏蔽面，请谨慎。
      </a-alert>
      <a-form-item label="名称" required>
        <a-input v-model="form.name" placeholder="如：变更窗口屏蔽-product-soa" :max-length="64" />
      </a-form-item>
      <a-form-item label="规则 code（留空 = 屏蔽全部规则）">
        <a-select v-model="form.rule_code" placeholder="可选，精确匹配某条规则" allow-clear allow-search :loading="rulesLoading">
          <a-option v-for="r in ruleOptions" :key="r.code" :value="r.code">{{ r.name ? `${r.name}（${r.code}）` : r.code }}</a-option>
        </a-select>
      </a-form-item>
      <a-form-item label="标签匹配（事件 labels 须包含以下全部键值对；留空 = 不按标签过滤）">
        <div class="label-editor">
          <div v-for="(row, i) in labelRows" :key="i" class="label-row">
            <a-input v-model="row.k" placeholder="键，如 env" size="small" />
            <span class="eq">=</span>
            <a-input v-model="row.v" placeholder="值，如 prod" size="small" />
            <a-button type="text" size="mini" status="danger" @click="labelRows.splice(i, 1)"><template #icon><icon-delete /></template></a-button>
          </div>
          <a-button type="dashed" size="mini" @click="labelRows.push({ k: '', v: '' })"><template #icon><icon-plus /></template>添加标签</a-button>
        </div>
      </a-form-item>
      <a-form-item label="时间窗" required>
        <a-space direction="vertical" fill style="width: 100%">
          <a-space wrap>
            <a-button size="mini" @click="applyQuick(3600e3)">1 小时</a-button>
            <a-button size="mini" @click="applyQuick(4 * 3600e3)">4 小时</a-button>
            <a-button size="mini" @click="applyQuick(24 * 3600e3)">24 小时</a-button>
            <a-button size="mini" @click="applyToday()">今日内</a-button>
          </a-space>
          <a-range-picker v-model="timeRange" show-time value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </a-space>
      </a-form-item>
      <a-form-item label="备注（建议写变更单号）">
        <a-input v-model="form.note" placeholder="如：CHG-2026-1024" :max-length="512" />
      </a-form-item>
      <a-form-item><a-checkbox v-model="form.enabled">启用（停用即临时放开通知）</a-checkbox></a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconDelete } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../../api/alert'
import type { IAlertMute, IAlertMuteCreate, IAlertRule } from '../../../api/alert'

const props = defineProps<{
  visible: boolean
  editing?: IAlertMute | null
  preset?: { rule_code?: string | null; labels?: Record<string, string>; note?: string | null } | null
}>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'saved'): void }>()

const visProxy = computed({ get: () => props.visible, set: (v) => emit('update:visible', v) })

const saving = ref(false)
const rulesLoading = ref(false)
const ruleOptions = ref<IAlertRule[]>([])
const form = reactive({ name: '', rule_code: undefined as string | undefined, note: '', enabled: true })
const labelRows = ref<{ k: string; v: string }[]>([])
const timeRange = ref<[string, string] | undefined>()

async function ensureRules() {
  if (ruleOptions.value.length) return
  rulesLoading.value = true
  try { ruleOptions.value = (await alertApi.getAlertRules()).data } catch { /* ignore */ } finally { rulesLoading.value = false }
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toInput(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
function fromInput(s: string): string { return new Date(s.replace(' ', 'T')).toISOString() }

function applyQuick(ms: number) {
  const s = new Date()
  timeRange.value = [toInput(s), toInput(new Date(s.getTime() + ms))]
}
function applyToday() {
  const s = new Date()
  const e = new Date()
  e.setHours(23, 59, 59, 0)
  timeRange.value = [toInput(s), toInput(e)]
}

// 打开时按 编辑 / 预填 / 空白 三种来源初始化
watch(() => props.visible, (v) => {
  if (!v) return
  ensureRules()
  if (props.editing) {
    const m = props.editing
    Object.assign(form, { name: m.name, rule_code: m.rule_code || undefined, note: m.note || '', enabled: m.enabled })
    labelRows.value = Object.entries(m.labels || {}).map(([k, val]) => ({ k, v: String(val) }))
    timeRange.value = [toInput(new Date(m.starts_at)), toInput(new Date(m.ends_at))]
  } else {
    Object.assign(form, { name: '', rule_code: undefined, note: '', enabled: true })
    const p = props.preset
    form.rule_code = p?.rule_code || undefined
    form.note = p?.note || ''
    labelRows.value = Object.entries(p?.labels || {}).map(([k, val]) => ({ k, v: String(val) }))
    // 从事件详情快捷屏蔽：默认给 1 小时窗
    applyQuick(3600e3)
  }
})

function buildLabels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of labelRows.value) {
    const k = r.k.trim()
    if (k) out[k] = r.v.trim()
  }
  return out
}

async function handleSave() {
  if (!form.name.trim()) { Message.warning('请填写名称'); return }
  if (!timeRange.value?.[0] || !timeRange.value?.[1]) { Message.warning('请选择时间窗'); return }
  const startsAt = fromInput(timeRange.value[0])
  const endsAt = fromInput(timeRange.value[1])
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) { Message.warning('结束时间必须晚于开始时间'); return }
  const payload: IAlertMuteCreate = {
    name: form.name.trim(),
    rule_code: form.rule_code || null,
    labels: buildLabels(),
    starts_at: startsAt,
    ends_at: endsAt,
    note: form.note.trim() || null,
    enabled: form.enabled,
  }
  saving.value = true
  try {
    if (props.editing) { await alertApi.updateAlertMute(props.editing.id, payload); Message.success('已更新') }
    else { await alertApi.createAlertMute(payload); Message.success('已创建') }
    visProxy.value = false
    emit('saved')
  } catch { /* 拦截器已提示（403/校验） */ } finally { saving.value = false }
}
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.mute-tip { margin-bottom: $spacing-md; }
.label-editor { display: flex; flex-direction: column; gap: 6px; }
.label-row { display: flex; align-items: center; gap: 6px; }
.label-row .eq { color: $text-hint; }
</style>
