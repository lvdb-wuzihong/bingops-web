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
              <div class="status-cell"><span class="status-dot" :class="`status-${resource.status}`"></span>{{ statusText }}</div>
            </a-descriptions-item>
            <a-descriptions-item label="云厂商"><a-tag size="small" color="arcoblue">{{ providerLabel }}</a-tag></a-descriptions-item>
            <a-descriptions-item label="云账号">{{ resource.cloud_account }}</a-descriptions-item>
            <a-descriptions-item label="地域">{{ resource.region || '-' }}</a-descriptions-item>
            <a-descriptions-item label="可用区">{{ resource.zone || '-' }}</a-descriptions-item>
            <a-descriptions-item label="来源"><a-tag size="small" :color="sourceColor">{{ sourceText }}</a-tag></a-descriptions-item>
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
            <a-tab-pane key="monitor" title="资源监控">
              <div ref="monitorChartRef" class="monitor-chart"></div>
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
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { IconLeft, IconEdit } from '@arco-design/web-vue/es/icon'
import RelationView from './components/RelationView.vue'
import TagView from './components/TagView.vue'
import ChangeLogView from './components/ChangeLogView.vue'
import { getResourceDetail, updateResource } from '../../api/cmdb'
import type { ICmdbResource, IResourceUpdate } from '../../api/cmdb'
import * as modelApi from '../../api/model'
import type { IModelField } from '../../types/model'

use([CanvasRenderer, LineChart, TooltipComponent, GridComponent, LegendComponent])

const router = useRouter()
const route = useRoute()
const resourceId = Number(route.params.id)

const loading = ref(false)
const resource = ref<ICmdbResource | null>(null)
const activeTab = ref('fields')
const monitorChartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

const modelFields = ref<IModelField[]>([])
const modelName = ref('')

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云', k8s: 'Kubernetes', manual: '手动录入' }
const statusMap: Record<string, string> = { running: '运行中', ready: '就绪', not_ready: '未就绪', stopped: '已停止', pending: '启动中', failed: '异常', succeeded: '已完成', maintenance: '维护中', unknown: '未知' }
const sourceMap: Record<string, string> = { discovery: '自动发现', kafka: 'Kafka', manual: '手动录入' }

const providerLabel = computed(() => resource.value?.provider ? (providerMap[resource.value.provider] || resource.value.provider) : '-')
const statusText = computed(() => resource.value ? (statusMap[resource.value.status] || resource.value.status) : '')
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
  formData.value = { name: resource.value.name, status: resource.value.status, region: resource.value.region || '', zone: resource.value.zone || '' }
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

// ========== 图表 ==========
function initMonitorChart() {
  if (!monitorChartRef.value) return
  const chart = echarts.init(monitorChartRef.value)
  chartInstance = chart
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  chart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    legend: { data: ['CPU', '内存', '磁盘IO'], textStyle: { color: '#597ef7' }, top: 0 },
    grid: { left: 40, right: 20, top: 35, bottom: 25 },
    xAxis: { type: 'category', data: hours, axisLine: { lineStyle: { color: '#d6e4ff' } }, axisLabel: { color: '#597ef7', interval: 3 } },
    yAxis: { type: 'value', max: 100, axisLine: { show: false }, splitLine: { lineStyle: { color: '#e6f0ff' } }, axisLabel: { color: '#597ef7', formatter: '{value}%' } },
    series: [
      { name: 'CPU', type: 'line', smooth: true, data: [35,32,28,25,22,20,25,40,55,62,58,52,48,55,60,58,52,45,42,38,35,33,30,28], lineStyle: { color: '#1677ff', width: 2 }, itemStyle: { color: '#1677ff' }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{ offset: 0, color: 'rgba(22,119,255,0.15)' }, { offset: 1, color: 'rgba(22,119,255,0)' }]) } },
      { name: '内存', type: 'line', smooth: true, data: [62,62,61,60,60,59,61,64,68,70,72,71,69,70,72,71,68,66,65,64,63,63,62,62], lineStyle: { color: '#2f54eb', width: 2 }, itemStyle: { color: '#2f54eb' } },
      { name: '磁盘IO', type: 'line', smooth: true, data: [10,8,5,3,2,2,5,15,25,30,28,22,18,22,28,25,20,15,12,10,8,8,6,5], lineStyle: { color: '#52c41a', width: 2 }, itemStyle: { color: '#52c41a' } },
    ],
  })
}

function handleResize() { chartInstance?.resize() }

onMounted(async () => {
  await fetchDetail()
  // init chart after tab switch
  setTimeout(() => initMonitorChart(), 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
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

.monitor-chart { height: 300px; }
</style>
