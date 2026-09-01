<template>
  <div class="business-app-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">业务应用</span>
        <a-space>
          <a-input-search v-model="filterTeam" placeholder="按团队筛选" allow-clear style="width: 180px" @search="handleSearch" />
          <a-button type="primary" @click="handleAdd">
            <template #icon><icon-plus /></template>新增应用
          </a-button>
        </a-space>
      </div>
      <a-table
        :data="apps"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #app_code="{ record }"><a-tag size="small" color="arcoblue">{{ record.app_code }}</a-tag></template>
        <template #repo_url="{ record }">
          <a-link v-if="record.repo_url" class="repo-link" :href="record.repo_url" target="_blank">{{ record.repo_url.replace(/^https?:\/\//, '') }}</a-link>
          <span v-else>-</span>
        </template>
        <template #pipelines="{ record }">
          <a-space v-if="Object.keys(record.pipelines || {}).length" wrap size="mini">
            <a-tag v-for="env in Object.keys(record.pipelines)" :key="env" size="small" :color="envColor(env)">{{ env }}</a-tag>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="openResources(record)"><template #icon><icon-apps /></template>资源</a-button>
            <a-button type="text" size="small" @click="handleEdit(record)"><template #icon><icon-edit /></template></a-button>
            <a-popconfirm content="确定删除该应用？" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑应用' : '新增应用'" :width="600" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="app_code" label="应用编码"><a-input v-model="formData.app_code" placeholder="如：order-service" :disabled="!!editingId" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="name" label="应用名称"><a-input v-model="formData.name" placeholder="如：订单服务" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="team" label="团队"><a-input v-model="formData.team" placeholder="如：基础架构" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="owner" label="负责人"><a-input v-model="formData.owner" placeholder="如：张三" /></a-form-item></a-col>
        </a-row>
        <a-form-item field="department" label="部门"><a-input v-model="formData.department" placeholder="如：技术部" /></a-form-item>
        <a-form-item field="repo_url" label="代码仓库地址">
          <a-input v-model="formData.repo_url" placeholder="可选，如：https://gitlab.example.com/group/order-service" />
        </a-form-item>
        <a-form-item label="流水线（按环境配置，key 对齐资源 env 标签）">
          <div class="pipeline-editor">
            <div v-for="(row, idx) in pipelineRows" :key="idx" class="pipeline-row">
              <a-select v-model="row.env" placeholder="环境" allow-search allow-create style="width: 130px">
                <a-option value="prod">prod</a-option>
                <a-option value="staging">staging</a-option>
                <a-option value="test">test</a-option>
                <a-option value="dev">dev</a-option>
              </a-select>
              <a-input v-model="row.url" placeholder="流水线地址" />
              <a-button type="text" status="danger" @click="pipelineRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button>
            </div>
            <a-button type="dashed" size="small" @click="pipelineRows.push({ env: '', url: '' })">
              <template #icon><icon-plus /></template>添加流水线
            </a-button>
          </div>
        </a-form-item>
        <a-form-item field="description" label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 应用关联资源抽屉 -->
    <a-drawer v-model:visible="drawerVisible" :title="`关联资源 - ${drawerApp?.name ?? ''}`" :width="760" unmount-on-close>
      <div class="bind-bar">
        <a-input-number v-model="bindResourceId" placeholder="资源 ID" :min="1" hide-button style="width: 160px" />
        <a-button type="primary" :loading="bindLoading" @click="handleBind">绑定资源</a-button>
        <span class="bind-tip">仅支持服务级 CI（workload / 中间件 / 数据库等）</span>
        <a-select v-model="envFilter" placeholder="全部环境" allow-clear style="width: 130px; margin-left: auto">
          <a-option v-for="opt in envOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
        </a-select>
      </div>
      <a-table :data="filteredResources" :loading="drawerLoading" :columns="resourceColumns" :pagination="false" row-key="resource_id" size="small">
        <template #empty>
          <a-empty description="暂无关联资源，可通过标签自动归集或手动绑定" />
        </template>
        <template #name="{ record }">
          <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.resource_id) } })">{{ record.name }}</a-link>
        </template>
        <template #model_code="{ record }"><a-tag size="small" color="arcoblue">{{ record.model_code }}</a-tag></template>
        <template #env="{ record }">
          <a-tag v-if="record.env" size="small" :color="envColor(record.env)">{{ record.env }}</a-tag>
          <span v-else>-</span>
        </template>
        <template #provider="{ record }">{{ providerMap[record.provider] || record.provider }}</template>
        <template #status="{ record }">{{ record.status ? (statusMap[record.status] || record.status) : '无状态' }}</template>
        <template #source="{ record }">
          <a-tag size="small" :color="record.source === 'tag' ? 'green' : 'blue'">{{ record.source === 'tag' ? '标签归集' : '手动绑定' }}</a-tag>
        </template>
        <template #pipeline="{ record }">
          <a-link v-if="record.env && drawerApp?.pipelines?.[record.env]" :href="drawerApp.pipelines[record.env]" target="_blank">打开</a-link>
          <span v-else>-</span>
        </template>
        <template #actions="{ record }">
          <a-popconfirm content="解绑该资源？" @ok="handleUnbind(record.resource_id)">
            <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
          </a-popconfirm>
        </template>
      </a-table>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconApps } from '@arco-design/web-vue/es/icon'
import * as appApi from '../../api/app'
import type { IBusinessApp, IAppResource } from '../../api/app'

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云', k8s: 'Kubernetes', manual: '手动录入' }
const statusMap: Record<string, string> = { running: '运行中', ready: '就绪', not_ready: '未就绪', stopped: '已停止', pending: '启动中', failed: '异常', succeeded: '已完成', maintenance: '维护中', unknown: '未知' }

const loading = ref(false)
const apps = ref<IBusinessApp[]>([])
const filterTeam = ref('')
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })
const columns = [
  { title: '应用编码', slotName: 'app_code', width: 140 },
  { title: '应用名称', dataIndex: 'name', width: 160 },
  { title: '团队', dataIndex: 'team', width: 120 },
  { title: '负责人', dataIndex: 'owner', width: 100 },
  { title: '仓库', slotName: 'repo_url', width: 170 },
  { title: '流水线', slotName: 'pipelines', width: 130 },
  { title: '操作', slotName: 'actions', width: 140 },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await appApi.getApps({ team: filterTeam.value || undefined, page: pagination.current, page_size: pagination.pageSize })
    apps.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取应用列表失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }

const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const formData = reactive({ app_code: '', name: '', team: '', owner: '', department: '', repo_url: '', description: '' })
const formRules = { app_code: [{ required: true, message: '请输入编码' }], name: [{ required: true, message: '请输入名称' }] }
// 流水线编辑行（提交时收敛为 {env: url} map）
const pipelineRows = ref<Array<{ env: string; url: string }>>([])

function handleAdd() {
  editingId.value = null
  Object.assign(formData, { app_code: '', name: '', team: '', owner: '', department: '', repo_url: '', description: '' })
  pipelineRows.value = []
  formVisible.value = true
}

function handleEdit(record: IBusinessApp) {
  editingId.value = record.id
  Object.assign(formData, { app_code: record.app_code, name: record.name, team: record.team || '', owner: record.owner || '', department: record.department || '', repo_url: record.repo_url || '', description: record.description || '' })
  pipelineRows.value = Object.entries(record.pipelines || {}).map(([env, url]) => ({ env, url }))
  formVisible.value = true
}

// 行编辑收敛为 map，半填行报错、空行忽略
function buildPipelines(): Record<string, string> | null {
  const pipelines: Record<string, string> = {}
  for (const row of pipelineRows.value) {
    if (!row.env.trim() && !row.url.trim()) continue
    if (!row.env.trim() || !row.url.trim()) { Message.warning('流水线行需同时填写环境与地址'); return null }
    pipelines[row.env.trim()] = row.url.trim()
  }
  return pipelines
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  const pipelines = buildPipelines()
  if (!pipelines) return
  formLoading.value = true
  try {
    if (editingId.value) {
      await appApi.updateApp(editingId.value, { name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined, repo_url: formData.repo_url || null, pipelines })
    } else {
      await appApi.createApp({ app_code: formData.app_code, name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined, repo_url: formData.repo_url || null, pipelines })
    }
    Message.success(editingId.value ? '编辑成功' : '新增成功')
    formVisible.value = false
    fetchData()
  } catch { Message.error('操作失败') } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await appApi.deleteApp(id); Message.success('删除成功'); fetchData() } catch { Message.error('删除失败') }
}

// ========== 关联资源抽屉 ==========
const drawerVisible = ref(false)
const drawerApp = ref<IBusinessApp | null>(null)
const drawerLoading = ref(false)
const appResources = ref<IAppResource[]>([])
const bindResourceId = ref<number | undefined>()
const bindLoading = ref(false)

const resourceColumns = [
  { title: '资源名称', slotName: 'name', width: 200, ellipsis: true },
  { title: '模型', slotName: 'model_code', width: 130 },
  { title: '环境', slotName: 'env', width: 90 },
  { title: '云厂商', slotName: 'provider', width: 90 },
  { title: '状态', slotName: 'status', width: 80 },
  { title: '来源', slotName: 'source', width: 100 },
  { title: '流水线', slotName: 'pipeline', width: 70 },
  { title: '操作', slotName: 'actions', width: 60 },
]

// 环境维度：env 来自资源 env/k8s:env 标签，客户端即时筛选
const envFilter = ref<string | undefined>()

const envOptions = computed(() => {
  const envs = [...new Set(appResources.value.map(r => r.env).filter((e): e is string => !!e))].sort()
  const opts = envs.map(e => ({ value: e, label: e }))
  if (appResources.value.some(r => !r.env)) opts.push({ value: '__none__', label: '未设置' })
  return opts
})

const filteredResources = computed(() => {
  if (!envFilter.value) return appResources.value
  if (envFilter.value === '__none__') return appResources.value.filter(r => !r.env)
  return appResources.value.filter(r => r.env === envFilter.value)
})

function envColor(env: string): string {
  if (/^prod/i.test(env)) return 'red'
  if (/^(stag|pre)/i.test(env)) return 'orange'
  if (/^(test|dev|sit|uat)/i.test(env)) return 'green'
  return 'blue'
}

function openResources(app: IBusinessApp) {
  drawerApp.value = app
  envFilter.value = undefined
  drawerVisible.value = true
  fetchAppResources()
}

async function fetchAppResources() {
  if (!drawerApp.value) return
  drawerLoading.value = true
  try { const res = await appApi.getAppResources(drawerApp.value.id); appResources.value = res.data } catch { /* 拦截器已提示 */ } finally { drawerLoading.value = false }
}

async function handleBind() {
  if (!drawerApp.value || !bindResourceId.value) { Message.warning('请输入资源 ID'); return }
  bindLoading.value = true
  try {
    await appApi.bindAppResource(drawerApp.value.id, bindResourceId.value)
    Message.success('绑定成功')
    bindResourceId.value = undefined
    fetchAppResources()
  } catch { /* 拦截器已提示（如非服务级 CI） */ } finally { bindLoading.value = false }
}

async function handleUnbind(resourceId: number) {
  if (!drawerApp.value) return
  try { await appApi.unbindAppResource(drawerApp.value.id, resourceId); Message.success('解绑成功'); fetchAppResources() } catch { Message.error('解绑失败') }
}

onMounted(() => fetchData())
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;
.business-app-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.bind-bar { display: flex; align-items: center; gap: $spacing-sm; margin-bottom: $spacing-md; }
.bind-tip { font-size: $font-size-xs; color: $text-secondary; }

.repo-link {
  display: inline-block; max-width: 150px; vertical-align: bottom;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pipeline-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .pipeline-row { display: flex; gap: $spacing-xs; align-items: center; :deep(.arco-input-wrapper) { flex: 1; } }
}
</style>
