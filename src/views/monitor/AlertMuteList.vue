<template>
  <div class="alert-mute-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">告警屏蔽</span>
        <a-space>
          <a-button v-if="canCreate" type="primary" size="small" @click="openCreate">
            <template #icon><icon-plus /></template>新建屏蔽
          </a-button>
          <a-button size="small" @click="fetchData"><template #icon><icon-refresh /></template></a-button>
        </a-space>
      </div>
      <a-alert class="mute-tip" type="info">
        时间窗内命中的告警仅<b>抑制飞书通知、事件照常落库</b>。范围由「规则 code + 标签」共同决定（都为空 = 屏蔽全部）；到期自动失效，已过期项保留供回看。
      </a-alert>

      <a-table :data="mutes" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #name="{ record }">
          <span class="mute-name">{{ record.name }}</span>
          <div v-if="record.note" class="mute-note mono">备注：{{ record.note }}</div>
        </template>
        <template #scope="{ record }">
          <div class="scope-line">
            <a-tag size="small" :color="record.rule_code ? 'arcoblue' : 'gray'">{{ record.rule_code || '全部规则' }}</a-tag>
          </div>
          <a-space v-if="Object.keys(record.labels || {}).length" wrap size="mini" class="scope-labels">
            <a-tag v-for="(v, k) in record.labels" :key="k" size="small">{{ k }}={{ v }}</a-tag>
          </a-space>
          <span v-else class="scope-none">不限标签</span>
        </template>
        <template #window="{ record }">
          <div>{{ fmtTime(record.starts_at) }}</div>
          <div class="window-end">~ {{ fmtTime(record.ends_at) }}</div>
        </template>
        <template #state="{ record }">
          <a-tag size="small" :color="muteState(record).color">{{ muteState(record).text }}</a-tag>
        </template>
        <template #enabled="{ record }">
          <a-switch :model-value="record.enabled" size="small" :disabled="!canUpdate" :loading="togglingId === record.id" @change="(v: string | number | boolean) => handleToggle(record, Boolean(v))" />
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button v-if="canUpdate" type="text" size="mini" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm v-if="canDelete" content="确定删除该屏蔽规则？" @ok="handleDelete(record.id)">
              <a-button type="text" size="mini" status="danger">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <AlertMuteModal v-model:visible="modalVisible" :editing="editingMute" @saved="fetchData" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import type { IAlertMute } from '../../api/alert'
import { useUserStore } from '../../stores/user'
import AlertMuteModal from './components/AlertMuteModal.vue'

const userStore = useUserStore()
const canCreate = computed(() => userStore.hasPermission('alert_mute:create'))
const canUpdate = computed(() => userStore.hasPermission('alert_mute:update'))
const canDelete = computed(() => userStore.hasPermission('alert_mute:delete'))

const loading = ref(false)
const mutes = ref<IAlertMute[]>([])

const columns = [
  { title: '名称', slotName: 'name', width: 220 },
  { title: '屏蔽范围', slotName: 'scope', width: 220 },
  { title: '时间窗', slotName: 'window', width: 170 },
  { title: '状态', slotName: 'state', width: 90 },
  { title: '启用', slotName: 'enabled', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

async function fetchData() {
  loading.value = true
  try { mutes.value = (await alertApi.getAlertMutes()).data } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function fmtTime(t: string): string {
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function muteState(m: IAlertMute): { text: string; color: string } {
  if (!m.enabled) return { text: '已停用', color: 'gray' }
  const now = Date.now()
  if (now < new Date(m.starts_at).getTime()) return { text: '未开始', color: 'arcoblue' }
  if (now > new Date(m.ends_at).getTime()) return { text: '已过期', color: 'gray' }
  return { text: '生效中', color: 'red' }
}

// ---------- 新建/编辑 ----------
const modalVisible = ref(false)
const editingMute = ref<IAlertMute | null>(null)

function openCreate() { editingMute.value = null; modalVisible.value = true }
function openEdit(record: IAlertMute) { editingMute.value = record; modalVisible.value = true }

const togglingId = ref<number | null>(null)
async function handleToggle(record: IAlertMute, enabled: boolean) {
  togglingId.value = record.id
  try {
    await alertApi.updateAlertMute(record.id, { enabled })
    record.enabled = enabled
    Message.success(enabled ? '已启用' : '已停用')
  } catch { /* 拦截器已提示 */ } finally { togglingId.value = null }
}

async function handleDelete(id: number) {
  try { await alertApi.deleteAlertMute(id); Message.success('已删除'); fetchData() } catch { /* 拦截器已提示 */ }
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.mute-tip { margin-bottom: $spacing-md; }

.mute-name { font-weight: 500; color: $text-primary; }
.mute-note { font-size: $font-size-xs; color: $text-hint; margin-top: 2px; }
.mono { font-family: $font-mono; }
.scope-line { margin-bottom: 4px; }
.scope-labels { margin-bottom: 4px; }
.scope-none { font-size: $font-size-xs; color: $text-hint; }
.window-end { color: $text-hint; }
</style>
