<template>
  <div class="notify-channel-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">通知渠道</span>
        <a-space>
          <a-button type="primary" size="small" @click="openChannelModal(null)">
            <template #icon><icon-plus /></template>登记渠道
          </a-button>
          <a-button size="small" @click="fetchChannels">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="channel-tip" type="info">
        告警媒介登记表：平台只登记配置并随分发体下发给执行器，发送动作仍在执行器。凭据红线：webhook URL 即 secret，平台只存 secret_ref 引用名，不落真地址；有规则绑定的渠道不可删除。
      </a-alert>

      <a-table :data="channels" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #name="{ record }"><span class="ch-name">{{ record.name }}</span></template>
        <template #type="{ record }">
          <a-tag size="small" color="arcoblue">{{ typeText(record.type) }}</a-tag>
        </template>
        <template #secret_ref="{ record }"><span class="cred-ref">{{ record.secret_ref }}</span></template>
        <template #extra="{ record }">
          <a-space wrap size="mini">
            <a-tag v-for="(v, k) in record.extra" :key="k" size="small">{{ k }}: {{ v }}</a-tag>
            <span v-if="!Object.keys(record.extra || {}).length">-</span>
          </a-space>
        </template>
        <template #enabled="{ record }">
          <a-tag size="small" :color="record.enabled ? 'green' : 'gray'">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button type="text" size="mini" @click="openChannelModal(record)">编辑</a-button>
            <a-popconfirm content="确定删除该渠道？有规则绑定时将被阻断。" @ok="handleDelete(record.id)">
              <a-button type="text" size="mini" status="danger">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 登记/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑通知渠道' : '登记通知渠道'" :width="520" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="name" label="名称" required>
              <a-input v-model="formData.name" placeholder="如：prod-feishu-ops" :disabled="!!editingId" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="type" label="类型">
              <a-select v-model="formData.type">
                <a-option value="feishu_webhook">飞书群机器人</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item field="secret_ref" label="凭据引用名（secret_ref）" required>
          <a-input v-model="formData.secret_ref" placeholder="如 prod-feishu-hook；真 webhook 地址在执行器侧 env，平台不落 URL" />
        </a-form-item>
        <a-form-item label="附加参数（非敏感，如 @ 手机号）">
          <div class="extra-editor">
            <div v-for="(row, idx) in extraRows" :key="idx" class="extra-row">
              <a-input v-model="row.k" placeholder="key，如 at_mobiles" />
              <a-input v-model="row.v" placeholder="value" />
              <a-button type="text" status="danger" @click="extraRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button>
            </div>
            <a-button type="dashed" size="small" @click="extraRows.push({ k: '', v: '' })">
              <template #icon><icon-plus /></template>添加参数
            </a-button>
          </div>
        </a-form-item>
        <a-form-item label="状态">
          <a-checkbox v-model="formData.enabled">启用</a-checkbox>
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
import type { INotifyChannel } from '../../api/alert'

function typeText(type: string): string {
  if (type === 'feishu_webhook') return '飞书群机器人'
  return type
}

const loading = ref(false)
const channels = ref<INotifyChannel[]>([])

const columns = [
  { title: '名称', slotName: 'name', width: 180 },
  { title: '类型', slotName: 'type', width: 130 },
  { title: '凭据（引用名）', slotName: 'secret_ref', width: 200 },
  { title: '附加参数', slotName: 'extra' },
  { title: '状态', slotName: 'enabled', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

async function fetchChannels() {
  loading.value = true
  try { channels.value = (await alertApi.getNotifyChannels()).data } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

// ---------- 表单 ----------

const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formData = reactive({
  name: '', type: 'feishu_webhook' as INotifyChannel['type'],
  secret_ref: '', enabled: true,
})
const extraRows = ref<Array<{ k: string; v: string }>>([])

function buildExtra(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of extraRows.value) {
    if (r.k.trim()) out[r.k.trim()] = r.v
  }
  return out
}

function openChannelModal(ch: INotifyChannel | null) {
  editingId.value = ch?.id ?? null
  Object.assign(formData, {
    name: ch?.name ?? '',
    type: ch?.type ?? 'feishu_webhook',
    secret_ref: ch?.secret_ref ?? '',
    enabled: ch?.enabled ?? true,
  })
  extraRows.value = Object.entries(ch?.extra ?? {}).map(([k, v]) => ({ k, v: String(v) }))
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim() || !formData.secret_ref.trim()) {
    Message.warning('名称与凭据引用名必填'); return
  }
  formLoading.value = true
  try {
    if (editingId.value) {
      await alertApi.updateNotifyChannel(editingId.value, {
        secret_ref: formData.secret_ref.trim(),
        extra: buildExtra(),
        enabled: formData.enabled,
      })
      Message.success('已更新')
    } else {
      await alertApi.createNotifyChannel({
        name: formData.name.trim(), type: formData.type,
        secret_ref: formData.secret_ref.trim(),
        extra: buildExtra(), enabled: formData.enabled,
      })
      Message.success('已登记')
    }
    formVisible.value = false
    fetchChannels()
  } catch { /* 拦截器已提示（如名称重复） */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await alertApi.deleteNotifyChannel(id); Message.success('已删除'); fetchChannels() } catch { /* 拦截器已提示（有规则绑定阻断） */ }
}

onMounted(fetchChannels)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.channel-tip { margin-bottom: $spacing-md; }
.ch-name { font-weight: 500; color: $text-primary; }
.cred-ref { font-family: monospace; }
.extra-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .extra-row { display: flex; gap: $spacing-xs; align-items: center; .arco-input-wrapper { flex: 1; } }
}
</style>
