<template>
  <div class="monitoring-source-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">监控数据源</span>
        <a-space>
          <a-button type="primary" size="small" @click="openSourceModal(null)">
            <template #icon><icon-plus /></template>注册数据源
          </a-button>
          <a-button size="small" @click="fetchSources">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="source-tip" type="info">
        多套 ClickHouse / VictoriaMetrics / Prometheus 的注册表。凭据红线：平台只存 password_ref 引用名，真凭据留在执行器侧 env；有启用规则绑定的数据源不可删除。
      </a-alert>

      <a-table :data="sources" :loading="loading" :columns="columns" :pagination="false" row-key="id" size="small">
        <template #name="{ record }">
          <span class="src-name">{{ record.name }}</span>
          <div class="src-region">{{ record.region || '-' }}<template v-if="record.vpc"> · {{ record.vpc }}</template></div>
        </template>
        <template #type="{ record }">
          <a-tag size="small" :color="typeColor(record.type)">{{ record.type }}</a-tag>
        </template>
        <template #endpoint="{ record }">
          <span class="endpoint">{{ record.host }}:{{ record.port }}<template v-if="record.secure"> (TLS)</template></span>
          <div v-if="record.database_name" class="src-region">db: {{ record.database_name }}</div>
        </template>
        <template #credential="{ record }">
          <span class="cred-ref">{{ record.username ? `${record.username} / ` : '' }}{{ record.password_ref }}</span>
        </template>
        <template #enabled="{ record }">
          <a-tag size="small" :color="record.enabled ? 'green' : 'gray'">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button type="text" size="mini" @click="openSourceModal(record)">编辑</a-button>
            <a-popconfirm content="确定删除该数据源？有启用规则绑定时将被阻断。" @ok="handleDelete(record.id)">
              <a-button type="text" size="mini" status="danger">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 注册/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑数据源' : '注册数据源'" :width="560" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="name" label="名称" required>
              <a-input v-model="formData.name" placeholder="如：prod-clickhouse" :disabled="!!editingId" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="type" label="类型" required>
              <a-select v-model="formData.type" :disabled="!!editingId">
                <a-option value="clickhouse">ClickHouse</a-option>
                <a-option value="victoria">VictoriaMetrics</a-option>
                <a-option value="prometheus">Prometheus</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item field="host" label="主机" required>
              <a-input v-model="formData.host" placeholder="IP 或域名" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item field="port" label="端口" required>
              <a-input-number v-model="formData.port" :min="1" :max="65535" hide-button style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="database_name" label="数据库（CH）">
              <a-input v-model="formData.database_name" placeholder="可选" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="username" label="只读账号">
              <a-input v-model="formData.username" placeholder="可选，专用只读账号" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item field="password_ref" label="凭据引用名（password_ref）" required>
          <a-input v-model="formData.password_ref" placeholder="如 prod-ch-readonly；真凭据在执行器侧 env，平台不落密码" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item field="region" label="环境/区域">
              <a-input v-model="formData.region" placeholder="可选" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item field="vpc" label="VPC">
              <a-input v-model="formData.vpc" placeholder="可选，VPC provider_id" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="选项">
              <a-space size="medium">
                <a-checkbox v-model="formData.secure">TLS</a-checkbox>
                <a-checkbox v-model="formData.enabled">启用</a-checkbox>
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as alertApi from '../../api/alert'
import type { IMonitoringSource, MonitoringSourceType } from '../../api/alert'

function typeColor(type: MonitoringSourceType): string {
  if (type === 'clickhouse') return 'arcoblue'
  if (type === 'victoria') return 'green'
  return 'orange'
}

const loading = ref(false)
const sources = ref<IMonitoringSource[]>([])

const columns = [
  { title: '名称', slotName: 'name', width: 180 },
  { title: '类型', slotName: 'type', width: 110 },
  { title: '连接', slotName: 'endpoint', width: 200 },
  { title: '凭据（引用名）', slotName: 'credential', width: 180 },
  { title: '状态', slotName: 'enabled', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

async function fetchSources() {
  loading.value = true
  try { sources.value = (await alertApi.getMonitoringSources()).data } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

// ---------- 表单 ----------

const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formData = reactive({
  name: '', type: 'clickhouse' as MonitoringSourceType, host: '', port: 9000,
  database_name: '', username: '', password_ref: '', secure: false,
  region: '', vpc: '', enabled: true,
})

function openSourceModal(src: IMonitoringSource | null) {
  editingId.value = src?.id ?? null
  Object.assign(formData, {
    name: src?.name ?? '',
    type: src?.type ?? 'clickhouse',
    host: src?.host ?? '',
    port: src?.port ?? 9000,
    database_name: src?.database_name ?? '',
    username: src?.username ?? '',
    password_ref: src?.password_ref ?? '',
    secure: src?.secure ?? false,
    region: src?.region ?? '',
    vpc: src?.vpc ?? '',
    enabled: src?.enabled ?? true,
  })
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim() || !formData.host.trim() || !formData.password_ref.trim()) {
    Message.warning('名称、主机、凭据引用名必填'); return
  }
  formLoading.value = true
  try {
    if (editingId.value) {
      await alertApi.updateMonitoringSource(editingId.value, {
        host: formData.host.trim(), port: formData.port,
        database_name: formData.database_name || null,
        username: formData.username || null,
        password_ref: formData.password_ref.trim(),
        secure: formData.secure, region: formData.region || null,
        vpc: formData.vpc || null, enabled: formData.enabled,
      })
      Message.success('已更新')
    } else {
      await alertApi.createMonitoringSource({
        name: formData.name.trim(), type: formData.type,
        host: formData.host.trim(), port: formData.port,
        database_name: formData.database_name || null,
        username: formData.username || null,
        password_ref: formData.password_ref.trim(),
        secure: formData.secure, region: formData.region || null,
        vpc: formData.vpc || null, enabled: formData.enabled,
      })
      Message.success('已注册')
    }
    formVisible.value = false
    fetchSources()
  } catch { /* 拦截器已提示（如名称重复） */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await alertApi.deleteMonitoringSource(id); Message.success('已删除'); fetchSources() } catch { /* 拦截器已提示（有启用规则绑定阻断） */ }
}

onMounted(fetchSources)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.source-tip { margin-bottom: $spacing-md; }
.src-name { font-weight: 500; color: $text-primary; }
.src-region { font-size: $font-size-xs; color: $text-secondary; }
.endpoint { font-family: monospace; }
.cred-ref { font-family: monospace; }
</style>
