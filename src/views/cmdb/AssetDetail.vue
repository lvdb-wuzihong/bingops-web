<template>
  <div class="resource-detail">
    <div class="detail-header">
      <a-button type="text" @click="router.back()">
        <template #icon><icon-left /></template>返回列表
      </a-button>
      <a-space>
        <a-button type="primary" @click="handleEdit">
          <template #icon><icon-edit /></template>编辑
        </a-button>
      </a-space>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <div v-if="resource" class="detail-body">
        <!-- 基本信息 -->
        <a-card title="基本信息" class="detail-card">
          <a-descriptions :column="2" layout="horizontal" size="medium">
            <a-descriptions-item label="资源名称"><span class="mono-text">{{ resource.name }}</span></a-descriptions-item>
            <a-descriptions-item label="Provider ID"><span class="mono-text">{{ resource.provider_id }}</span></a-descriptions-item>
            <a-descriptions-item label="所属模型"><a-tag size="small" color="arcoblue">{{ modelName || resource.model_name || '-' }}</a-tag></a-descriptions-item>
            <a-descriptions-item label="状态">
              <div class="status-cell"><span class="status-dot" :class="resource.status ? `status-${resource.status}` : 'status-none'"></span>{{ statusText }}</div>
            </a-descriptions-item>
            <a-descriptions-item label="云厂商"><a-tag size="small" color="arcoblue">{{ providerLabel }}</a-tag></a-descriptions-item>
            <a-descriptions-item label="云账号">{{ resource.cloud_account }}</a-descriptions-item>
            <a-descriptions-item label="地域">{{ resource.region || '-' }}</a-descriptions-item>
            <a-descriptions-item label="可用区">{{ resource.zone || '-' }}</a-descriptions-item>
            <a-descriptions-item label="来源"><a-tag size="small" :color="sourceColor">{{ sourceText }}</a-tag></a-descriptions-item>
            <a-descriptions-item label="归属应用">
              <a-space v-if="resourceApps.length" wrap>
                <a-tag v-for="app in resourceApps" :key="app.app_id" size="small" :color="app.source === 'tag' ? 'green' : 'blue'">{{ app.name }}</a-tag>
              </a-space>
              <span v-else>-</span>
            </a-descriptions-item>
            <a-descriptions-item label="资源版本">{{ resource.resource_version || '-' }}</a-descriptions-item>
            <a-descriptions-item label="同步时间">{{ resource.synced_at ? formatTime(resource.synced_at) : '-' }}</a-descriptions-item>
            <a-descriptions-item label="创建时间">{{ formatTime(resource.created_at) }}</a-descriptions-item>
            <a-descriptions-item label="更新时间" :span="2">{{ resource.updated_at ? formatTime(resource.updated_at) : '-' }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- Tabs -->
        <a-card class="detail-card detail-card-wide" :bordered="false">
          <a-tabs v-model:active-key="activeTab">
            <a-tab-pane key="fields" title="扩展属性">
              <div v-if="groupedFields.length > 0">
                <template v-for="group in groupedFields" :key="group.name">
                  <h4 class="field-group-title">{{ group.name }}</h4>
                  <div class="fields-grid">
                    <div v-for="item in group.items" :key="item.code" class="field-item">
                      <span class="field-key">{{ item.label }}</span>
                      <span class="field-value">{{ item.displayValue }}</span>
                    </div>
                  </div>
                </template>
              </div>
              <a-empty v-else description="暂无扩展字段" />
            </a-tab-pane>
            <a-tab-pane key="relations" title="关系拓扑">
              <RelationView :resource-id="resourceId" />
            </a-tab-pane>
            <a-tab-pane key="tags" title="标签">
              <TagView :resource-id="resourceId" />
            </a-tab-pane>
            <a-tab-pane key="changelog" title="变更记录">
              <ChangeLogView :resource-id="resourceId" />
            </a-tab-pane>
          </a-tabs>
        </a-card>
      </div>
    </a-spin>

    <!-- 编辑弹窗 -->
    <a-modal v-model:visible="formVisible" title="编辑资源" :width="640" :ok-loading="formLoading" @ok="handleFormSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="name" label="资源名称"><a-input v-model="formData.name" placeholder="请输入" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="status" label="状态">
              <a-select v-model="formData.status" placeholder="请选择">
                <a-option value="running">运行中</a-option>
                <a-option value="ready">就绪</a-option>
                <a-option value="not_ready">未就绪</a-option>
                <a-option value="stopped">已停止</a-option>
                <a-option value="pending">启动中</a-option>
                <a-option value="failed">异常</a-option>
                <a-option value="succeeded">已完成</a-option>
                <a-option value="maintenance">维护中</a-option>
                <a-option value="unknown">未知</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="region" label="地域"><a-input v-model="formData.region" placeholder="如 cn-beijing" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="zone" label="可用区"><a-input v-model="formData.zone" placeholder="如 cn-beijing-a" /></a-form-item>
          </a-col>
        </a-row>
        <!-- 动态字段 -->
        <a-divider v-if="editFieldDefs.length > 0">扩展字段</a-divider>
        <a-row :gutter="16">
          <a-col v-for="fd in editFieldDefs" :key="fd.code" :span="fd.field_type === 'json' || fd.field_type === 'password' ? 24 : 12">
            <a-form-item :label="fd.name">
              <a-input v-if="fd.field_type === 'string'" v-model="dynamicFields[fd.code]" :placeholder="fd.placeholder || ''" />
              <a-input-number v-else-if="fd.field_type === 'number'" v-model="dynamicFields[fd.code]" style="width:100%" />
              <a-switch v-else-if="fd.field_type === 'boolean'" v-model="dynamicFields[fd.code]" />
              <a-date-picker v-else-if="fd.field_type === 'date'" v-model="dynamicFields[fd.code]" style="width:100%" />
              <a-date-picker v-else-if="fd.field_type === 'datetime'" v-model="dynamicFields[fd.code]" show-time style="width:100%" />
              <a-select v-else-if="fd.field_type === 'enum'" v-model="dynamicFields[fd.code]" allow-clear>
                <a-option v-for="opt in (fd.options || [])" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
              </a-select>
              <a-select v-else-if="fd.field_type === 'multi_enum'" v-model="dynamicFields[fd.code]" allow-clear multiple>
                <a-option v-for="opt in (fd.options || [])" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
              </a-select>
              <a-input-password v-else-if="fd.field_type === 'password'" v-model="dynamicFields[fd.code]" />
              <a-textarea v-else-if="fd.field_type === 'json'" v-model="dynamicFields[fd.code]" :auto-size="{ minRows: 2, maxRows: 6 }" />
              <a-input v-else v-model="dynamicFields[fd.code]" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconLeft, IconEdit } from '@arco-design/web-vue/es/icon'
import RelationView from './components/RelationView.vue'
import TagView from './components/TagView.vue'
import ChangeLogView from './components/ChangeLogView.vue'
import { getResourceDetail, updateResource } from '../../api/cmdb'
import type { ICmdbResource, IResourceUpdate } from '../../api/cmdb'
import { getResourceApps } from '../../api/app'
import type { IResourceApp } from '../../api/app'
import * as modelApi from '../../api/model'
import type { IModelField } from '../../types/model'

const router = useRouter()
const route = useRoute()
const resourceId = Number(route.params.id)

const loading = ref(false)
const resource = ref<ICmdbResource | null>(null)
const activeTab = ref('fields')

const modelFields = ref<IModelField[]>([])
const modelName = ref('')
const resourceApps = ref<IResourceApp[]>([])

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云', k8s: 'Kubernetes', manual: '手动录入' }
const statusMap: Record<string, string> = { running: '运行中', ready: '就绪', not_ready: '未就绪', stopped: '已停止', pending: '启动中', failed: '异常', succeeded: '已完成', maintenance: '维护中', unknown: '未知' }
const sourceMap: Record<string, string> = { discovery: '自动发现', kafka: 'Kafka', manual: '手动录入' }

const providerLabel = computed(() => resource.value?.provider ? (providerMap[resource.value.provider] || resource.value.provider) : '-')
const statusText = computed(() => {
  if (!resource.value) return ''
  const s = resource.value.status
  return s ? (statusMap[s] || s) : '无状态'
})
const sourceText = computed(() => resource.value ? (sourceMap[resource.value.source] || resource.value.source) : '')
const sourceColor = computed(() => {
  if (!resource.value) return 'gray'
  return resource.value.source === 'discovery' ? 'green' : resource.value.source === 'kafka' ? 'purple' : 'orange'
})

// Group fields by group_name
const groupedFields = computed(() => {
  if (!resource.value?.fields || modelFields.value.length === 0) {
    // fallback: show raw fields
    if (!resource.value?.fields) return []
    const entries = Object.entries(resource.value.fields)
    if (entries.length === 0) return []
    return [{ name: '扩展字段', items: entries.map(([k, v]) => ({ code: k, label: k, displayValue: formatFieldValue(v) })) }]
  }
  const groups: Record<string, { name: string; items: { code: string; label: string; displayValue: string }[] }> = {}
  modelFields.value.forEach(f => {
    const val = resource.value!.fields?.[f.code]
    if (val === undefined || val === null) return
    const groupName = f.group_name || '其他'
    if (!groups[groupName]) groups[groupName] = { name: groupName, items: [] }
    groups[groupName].items.push({ code: f.code, label: f.name, displayValue: formatFieldValue(val) })
  })
  return Object.values(groups)
})

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined) return '-'
  // 字符串数组（如工作负载镜像列表）逐行展示，避免裸 JSON 括号引号
  if (Array.isArray(val) && val.length > 0 && val.every(i => typeof i === 'string')) return val.join('\n')
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function fetchDetail() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    resource.value = res.data
    // fetch model fields
    if (res.data.model_id) {
      try {
        const fieldRes = await modelApi.getModelFields(res.data.model_id)
        modelFields.value = fieldRes.data
      } catch { /* ignore */ }
      // 后端详情响应不含 model_name，单独拉取模型信息
      try {
        const modelRes = await modelApi.getModelDetail(res.data.model_id)
        modelName.value = modelRes.data.name
      } catch { /* ignore */ }
    }
    // 归属应用（应用-资源关联）
    try {
      const appRes = await getResourceApps(resourceId)
      resourceApps.value = appRes.data
    } catch { /* ignore */ }
  } catch { Message.error('获取资源详情失败') } finally { loading.value = false }
}

// ========== 编辑弹窗 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const formRef = ref()
const dynamicFields = reactive<Record<string, any>>({})

const formData = ref({ name: '', status: '', region: '', zone: '' })
const formRules = { name: [{ required: true, message: '请输入资源名称' }], status: [{ required: true, message: '请选择状态' }] }

const editFieldDefs = computed(() => modelFields.value.filter(f => !f.is_builtin))

function handleEdit() {
  if (!resource.value) return
  formData.value = { name: resource.value.name, status: resource.value.status ?? '', region: resource.value.region || '', zone: resource.value.zone || '' }
  Object.keys(dynamicFields).forEach(k => delete dynamicFields[k])
  editFieldDefs.value.forEach(f => {
    const val = resource.value!.fields?.[f.code]
    if (val === null || val === undefined) {
      dynamicFields[f.code] = f.field_type === 'multi_enum' ? [] : undefined
    } else if (typeof val === 'object' && f.field_type !== 'multi_enum') {
      // json 等复杂对象回显为格式化 JSON 文本，避免 textarea 显示 [object Object]
      dynamicFields[f.code] = JSON.stringify(val, null, 2)
    } else {
      dynamicFields[f.code] = val
    }
  })
  formVisible.value = true
}

async function handleFormSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  const fields: Record<string, unknown> = {}
  editFieldDefs.value.forEach(f => {
    const val = dynamicFields[f.code]
    if (val !== undefined && val !== null && val !== '') {
      if (f.field_type === 'json' && typeof val === 'string') {
        try { fields[f.code] = JSON.parse(val) } catch { fields[f.code] = val }
      } else {
        fields[f.code] = val
      }
    }
  })
  formLoading.value = true
  try {
    const data: IResourceUpdate = { name: formData.value.name, status: formData.value.status, region: formData.value.region || undefined, zone: formData.value.zone || undefined, fields }
    await updateResource(resourceId, data)
    Message.success('编辑成功')
    formVisible.value = false
    fetchDetail()
  } catch { Message.error('编辑失败') } finally { formLoading.value = false }
}

onMounted(() => {
  fetchDetail()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.resource-detail { display: flex; flex-direction: column; gap: $spacing-md; }

.detail-header { display: flex; justify-content: space-between; align-items: center; }

.detail-body { display: flex; flex-direction: column; gap: $spacing-md; }

.detail-card {
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  &-wide { width: 100%; }
}

.mono-text { font-family: $font-mono; color: $color-primary; }

.status-cell { display: flex; align-items: center; gap: 6px; }

.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  &.status-running { background: $color-success; box-shadow: 0 0 6px rgba(82,196,26,0.5); }
  &.status-ready { background: $color-success; box-shadow: 0 0 6px rgba(82,196,26,0.5); }
  &.status-succeeded { background: $color-primary; box-shadow: 0 0 6px rgba(22,119,255,0.4); }
  &.status-stopped { background: $color-danger; box-shadow: 0 0 6px rgba(255,77,79,0.4); }
  &.status-failed { background: $color-danger; box-shadow: 0 0 6px rgba(255,77,79,0.4); }
  &.status-not_ready { background: $color-danger; box-shadow: 0 0 6px rgba(255,77,79,0.4); }
  &.status-pending { background: $color-warning; box-shadow: 0 0 6px rgba(250,173,20,0.4); }
  &.status-maintenance { background: $color-warning; box-shadow: 0 0 6px rgba(250,173,20,0.4); }
  &.status-unknown { background: $text-disabled; }
  // 无生命周期状态：空心虚线圈
  &.status-none { background: transparent; border: 1px dashed $text-disabled; }
}

.field-group-title {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $text-secondary;
  margin: $spacing-md 0 $spacing-sm;
  padding-bottom: $spacing-xs;
  border-bottom: 1px solid $border-color-light;
}

.fields-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: $spacing-sm $spacing-lg;
  @media (max-width: 1280px) { grid-template-columns: 1fr 1fr; }
}

.field-item { display: flex; flex-direction: column; gap: 2px; padding: $spacing-xs 0; }
.field-key { font-size: $font-size-xs; color: $text-secondary; }
.field-value { font-family: $font-mono; font-size: $font-size-sm; color: $text-body; word-break: break-all; white-space: pre-wrap; }
</style>
