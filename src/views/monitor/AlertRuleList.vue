<template>
  <div class="alert-rule-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">告警规则映射</span>
        <a-space>
          <a-button type="primary" size="small" @click="openRuleModal(null)">
            <template #icon><icon-plus /></template>新增映射
          </a-button>
          <a-button size="small" @click="fetchRules">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="rule-tip" type="info">
        规则映射决定告警的开单去向：code 须与执行器侧 rule_code 对齐（人工纪律）；未配置映射的规则事件照常落库，但跳过自动开单。
      </a-alert>

      <a-table :data="rules" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #source="{ record }"><a-tag size="small" color="arcoblue">{{ record.source }}</a-tag></template>
        <template #rule="{ record }">
          <span class="rule-code">{{ record.code }}</span>
          <div v-if="record.name" class="rule-name">{{ record.name }}</div>
        </template>
        <template #group="{ record }">{{ groupName(record.group_id) }}</template>
        <template #stale="{ record }">{{ record.stale_minutes }} 分钟</template>
        <template #severity="{ record }">{{ severityMap[record.default_severity] || record.default_severity }}</template>
        <template #notify_enabled="{ record }">
          <a-tag size="small" :color="record.notify_enabled ? 'green' : 'gray'">{{ record.notify_enabled ? '开单' : '仅记录' }}</a-tag>
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
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑规则映射' : '新增规则映射'" :width="560" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="source" label="来源" required>
              <a-select v-model="formData.source" placeholder="选择或输入" allow-create>
                <a-option value="ck-log-alert">ck-log-alert（CK 日志）</a-option>
                <a-option value="n9e">夜莺 n9e（指标）</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="code" label="规则 code" required>
              <a-input v-model="formData.code" placeholder="与执行器 rule_code 对齐" :disabled="!!editingId" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item field="name" label="规则名称"><a-input v-model="formData.name" placeholder="可选，展示用" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="group_id" label="开单处理组">
              <a-select v-model="formData.group_id" placeholder="未选则跳过开单" allow-clear>
                <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="stale_minutes" label="恢复推导窗口（分钟）">
              <a-input-number v-model="formData.stale_minutes" :min="1" hide-button style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="default_severity" label="默认级别">
              <a-select v-model="formData.default_severity">
                <a-option :value="1">严重</a-option>
                <a-option :value="2">中等</a-option>
                <a-option :value="3">轻微</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="行为开关">
              <a-space size="medium">
                <a-checkbox v-model="formData.notify_enabled">自动开单</a-checkbox>
                <a-checkbox v-model="formData.enabled">启用</a-checkbox>
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="静态 labels（平台侧补齐，执行器未带时使用）">
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
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconDelete, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import type { IAlertRule } from '../../api/alert'
import * as metaApi from '../../api/ticketMeta'
import type { ITicketGroup } from '../../api/ticketMeta'

const severityMap: Record<number, string> = { 1: '严重', 2: '中等', 3: '轻微' }

const loading = ref(false)
const rules = ref<IAlertRule[]>([])
const groups = ref<ITicketGroup[]>([])

const columns = [
  { title: '来源', slotName: 'source', width: 110 },
  { title: '规则', slotName: 'rule', width: 220 },
  { title: '处理组', slotName: 'group', width: 130 },
  { title: '推导窗口', slotName: 'stale', width: 90 },
  { title: '默认级别', slotName: 'severity', width: 80 },
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
const formData = reactive({
  source: 'ck-log-alert', code: '', name: '',
  group_id: undefined as number | undefined, stale_minutes: 5, default_severity: 2,
  notify_enabled: true, enabled: true,
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
    source: rule?.source ?? 'ck-log-alert',
    code: rule?.code ?? '',
    name: rule?.name ?? '',
    group_id: rule?.group_id ?? undefined,
    stale_minutes: rule?.stale_minutes ?? 5,
    default_severity: rule?.default_severity ?? 2,
    notify_enabled: rule?.notify_enabled ?? true,
    enabled: rule?.enabled ?? true,
  })
  labelRows.value = Object.entries(rule?.static_labels ?? {}).map(([k, v]) => ({ k, v }))
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.source.trim() || !formData.code.trim()) { Message.warning('来源与规则 code 必填'); return }
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
      })
      Message.success('已更新')
    } else {
      await alertApi.createAlertRule({
        source: formData.source.trim(), code: formData.code.trim(),
        name: formData.name || null,
        group_id: formData.group_id ?? null,
        stale_minutes: formData.stale_minutes,
        default_severity: formData.default_severity,
        static_labels: buildLabels(),
        notify_enabled: formData.notify_enabled,
        enabled: formData.enabled,
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
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.rule-tip { margin-bottom: $spacing-md; }
.rule-code { font-weight: 500; color: $text-primary; }
.rule-name { font-size: $font-size-xs; color: $text-secondary; }
.label-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .label-row { display: flex; gap: $spacing-xs; align-items: center; .arco-input-wrapper { flex: 1; } }
}
</style>
