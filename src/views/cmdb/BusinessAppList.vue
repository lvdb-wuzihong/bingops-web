<template>
  <div class="business-app-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <a-space size="medium">
          <span class="panel-title">业务应用</span>
          <a-button size="small" @click="openDomainManager">
            <template #icon><icon-storage /></template>业务域管理
          </a-button>
        </a-space>
        <a-space>
          <a-select v-model="businessFilter" placeholder="全部业务域" allow-clear style="width: 150px">
            <a-option v-for="d in domains" :key="d.id" :value="d.id">{{ d.name }}（{{ d.app_count }}）</a-option>
          </a-select>
          <a-input-search v-model="filterTeam" placeholder="按团队筛选" allow-clear style="width: 180px" @search="handleSearch" />
          <a-button type="primary" @click="handleAdd">
            <template #icon><icon-plus /></template>新增应用
          </a-button>
        </a-space>
      </div>
      <a-table
        :data="filteredApps"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #app_code="{ record }"><a-tag size="small" color="arcoblue">{{ record.app_code }}</a-tag></template>
        <template #business="{ record }">
          <a-tag v-if="record.business_id" size="small" color="cyan">{{ domainNameMap[record.business_id] || `#${record.business_id}` }}</a-tag>
          <span v-else>-</span>
        </template>
        <template #repo_url="{ record }">
          <a-space v-if="record.repo_url" size="mini">
            <a-tooltip :content="record.repo_url">
              <a-link class="repo-link" :href="record.repo_url" target="_blank">{{ record.repo_url.replace(/^https?:\/\//, '') }}</a-link>
            </a-tooltip>
            <a-button type="text" size="mini" class="copy-btn" title="复制地址" @click="copyText(record.repo_url)">
              <template #icon><icon-copy /></template>
            </a-button>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #pipelines="{ record }">
          <a-space v-if="Object.keys(record.pipelines || {}).length" wrap size="mini">
            <a-tooltip v-for="env in Object.keys(record.pipelines)" :key="env" :content="record.pipelines[env]">
              <a-tag size="small" :color="envColor(env)" class="pipeline-tag" @click="openUrl(record.pipelines[env])">{{ env }}</a-tag>
            </a-tooltip>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="openTopology(record)"><template #icon><icon-branch /></template>拓扑</a-button>
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
        <a-form-item field="business_id" label="归属业务域">
          <a-select v-model="formData.business_id" placeholder="可选：应用之上的业务分组" allow-clear>
            <a-option v-for="d in domains" :key="d.id" :value="d.id">{{ d.name }}（{{ d.code }}）</a-option>
          </a-select>
        </a-form-item>
        <a-form-item field="repo_url" label="代码仓库地址">
          <a-input v-model="formData.repo_url" placeholder="可选，如：https://gitlab.example.com/group/order-service" />
        </a-form-item>
        <a-form-item label="流水线（按环境配置，key 对齐资源 env 标签）">
          <div class="pipeline-editor">
            <div v-for="(row, idx) in pipelineRows" :key="idx" class="pipeline-row">
              <a-select v-model="row.env" placeholder="环境" allow-search allow-create style="width: 130px">
                <!-- 选项来自标签定义 env 的允许值（与资源 env 标签值域联动）；标签未配置时可手输 -->
                <a-option v-for="e in envOptions" :key="e" :value="e">{{ e }}</a-option>
              </a-select>
              <a-input v-model="row.url" placeholder="流水线地址" />
              <a-button type="text" status="danger" @click="pipelineRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button>
            </div>
            <a-button type="dashed" size="small" @click="pipelineRows.push({ env: '', url: '' })">
              <template #icon><icon-plus /></template>添加流水线
            </a-button>
          </div>
        </a-form-item>
        <a-form-item label="依赖声明（应用拓扑数据源；保存后即时生效）">
          <div class="dependency-editor">
            <div v-for="(row, idx) in dependencyRows" :key="idx" class="dependency-row">
              <a-select v-model="row.type" placeholder="类型" style="width: 120px" @change="onDependencyTypeChange(row)">
                <a-option value="internal">内部应用</a-option>
                <a-option value="external">外部系统</a-option>
              </a-select>
              <template v-if="row.type === 'internal'">
                <!-- 数据源为全部应用（排除自己）；app_code 存在性由后端校验，前端不预检 -->
                <a-select v-model="row.app_code" placeholder="选择依赖的应用" allow-search style="flex: 1">
                  <a-option v-for="a in dependencyAppOptionsFiltered" :key="a.id" :value="a.app_code">{{ a.name }}（{{ a.app_code }}）</a-option>
                </a-select>
                <a-input v-model="row.note" placeholder="备注（可选），如：调用订单服务" style="width: 180px" />
              </template>
              <template v-else>
                <a-input v-model="row.name" placeholder="名称，如 Nacos 注册/配置中心" style="flex: 1" />
                <a-input v-model="row.url" placeholder="地址，如 nacos.gke.svc:8848" style="flex: 1" />
                <a-input v-model="row.note" placeholder="备注（可选）" style="width: 130px" />
              </template>
              <a-button type="text" status="danger" @click="dependencyRows.splice(idx, 1)"><template #icon><icon-delete /></template></a-button>
            </div>
            <a-button type="dashed" size="small" @click="addDependencyRow">
              <template #icon><icon-plus /></template>添加依赖
            </a-button>
          </div>
        </a-form-item>
        <a-form-item field="description" label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 应用关系视图抽屉 -->
    <AppTopologyDrawer v-model:visible="topoVisible" :app-id="topoAppId" />

    <!-- 业务域管理弹窗 -->
    <a-modal v-model:visible="domainModalVisible" title="业务域管理" :width="680" :footer="false" unmount-on-close>
      <div class="domain-toolbar">
        <a-button type="primary" size="small" @click="openDomainForm(null)">
          <template #icon><icon-plus /></template>新增业务域
        </a-button>
        <a-button size="small" @click="fetchDomains">
          <template #icon><icon-refresh /></template>
        </a-button>
      </div>
      <a-table :data="domains" :loading="domainLoading" :pagination="false" row-key="id" size="small">
        <template #name="{ record }">
          <span class="domain-name">{{ record.name }}</span>
          <span class="domain-code">{{ record.code }}</span>
        </template>
        <template #owner="{ record }">{{ record.owner || '-' }}</template>
        <template #actions="{ record }">
          <a-button type="text" size="mini" @click="openDomainForm(record)"><template #icon><icon-edit /></template></a-button>
        </template>
      </a-table>
    </a-modal>

    <!-- 业务域新增/编辑弹窗 -->
    <a-modal v-model:visible="domainFormVisible" :title="editingDomainId ? '编辑业务域' : '新增业务域'" :width="440" :ok-loading="domainFormLoading" @ok="handleDomainSubmit">
      <a-form :model="domainForm" :rules="domainRules" layout="vertical" ref="domainFormRef">
        <a-form-item field="name" label="业务域名称"><a-input v-model="domainForm.name" placeholder="如：电商平台" /></a-form-item>
        <a-form-item field="code" label="编码"><a-input v-model="domainForm.code" placeholder="如：ecommerce" :disabled="!!editingDomainId" /></a-form-item>
        <a-form-item field="owner" label="负责人"><a-input v-model="domainForm.owner" placeholder="可选" /></a-form-item>
        <a-form-item field="description" label="描述"><a-textarea v-model="domainForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 3 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 应用关联资源抽屉 -->
    <a-drawer v-model:visible="drawerVisible" :title="`关联资源 - ${drawerApp?.name ?? ''}`" :width="760" unmount-on-close>
      <div class="bind-bar">
        <a-input-number v-model="bindResourceId" placeholder="资源 ID" :min="1" hide-button style="width: 160px" />
        <a-button type="primary" :loading="bindLoading" @click="handleBind">绑定资源</a-button>
        <span class="bind-tip">仅支持服务级 CI（workload / 中间件 / 数据库等）；「部署流水线」仅对 workload / service 类资源生效，中间件类无构建语义</span>
        <a-select v-model="envFilter" placeholder="全部环境" allow-clear style="width: 130px; margin-left: auto">
          <a-option v-for="opt in drawerEnvOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-option>
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
          <!-- 三态：可部署模型且该环境已配置 → 打开；可部署但未配置 → -；中间件/存储类 → 灰色 —（无构建语义） -->
          <a-link v-if="isDeployable(record.model_code) && record.env && drawerApp?.pipelines?.[record.env]" :href="drawerApp.pipelines[record.env]" target="_blank">打开</a-link>
          <span v-else-if="!isDeployable(record.model_code)" class="pipeline-na">—</span>
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
import { IconPlus, IconEdit, IconDelete, IconApps, IconCopy, IconBranch, IconStorage, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as appApi from '../../api/app'
import type { IBusinessApp, IAppResource, IBusinessDomain, IAppDependency } from '../../api/app'
import { getTagDefinitions } from '../../api/tag'
import AppTopologyDrawer from './components/AppTopologyDrawer.vue'

const providerMap: Record<string, string> = { aliyun: '阿里云', aws: 'AWS', gcp: '谷歌云', k8s: 'Kubernetes', manual: '手动录入' }
const statusMap: Record<string, string> = { running: '运行中', ready: '就绪', not_ready: '未就绪', stopped: '已停止', pending: '启动中', failed: '异常', succeeded: '已完成', maintenance: '维护中', unknown: '未知' }

const loading = ref(false)
const apps = ref<IBusinessApp[]>([])
const filterTeam = ref('')
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })
const columns = [
  { title: '应用编码', slotName: 'app_code', width: 140 },
  { title: '应用名称', dataIndex: 'name', width: 150 },
  { title: '业务域', slotName: 'business', width: 100 },
  { title: '团队', dataIndex: 'team', width: 110 },
  { title: '负责人', dataIndex: 'owner', width: 90 },
  { title: '仓库', slotName: 'repo_url', width: 150 },
  { title: '流水线', slotName: 'pipelines', width: 120 },
  { title: '操作', slotName: 'actions', width: 180 },
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
const formData = reactive({ app_code: '', name: '', team: '', owner: '', department: '', repo_url: '', description: '', business_id: undefined as number | undefined })
const formRules = { app_code: [{ required: true, message: '请输入编码' }], name: [{ required: true, message: '请输入名称' }] }
// 流水线编辑行（提交时收敛为 {env: url} map）
const pipelineRows = ref<Array<{ env: string; url: string }>>([])

// 依赖声明编辑行（随 BusinessAppCreate/Update.dependencies 整体提交，声明式无缓存）
type DependencyRow = { type: 'internal' | 'external'; app_code: string; name: string; url: string; note: string }
const dependencyRows = ref<DependencyRow[]>([])
const dependencyAppOptions = ref<IBusinessApp[]>([])
// 排除自己：应用不能依赖自身
const dependencyAppOptionsFiltered = computed(() => dependencyAppOptions.value.filter(a => a.id !== editingId.value))

async function fetchDependencyOptions() {
  try {
    dependencyAppOptions.value = (await appApi.getApps({ page: 1, page_size: 200 })).data.items
  } catch { /* ignore */ }
}

function addDependencyRow() {
  dependencyRows.value.push({ type: 'internal', app_code: '', name: '', url: '', note: '' })
}

// 切换类型清空该行字段，避免残留跨类型数据
function onDependencyTypeChange(row: DependencyRow) {
  row.app_code = ''
  row.name = ''
  row.url = ''
}

// 收敛为提交契约：internal 必填 app_code；external name/url 至少一个；空 note 剥离
function buildDependencies(): IAppDependency[] | null {
  const deps: IAppDependency[] = []
  for (const row of dependencyRows.value) {
    const note = row.note.trim()
    if (row.type === 'internal') {
      if (!row.app_code) { Message.warning('内部依赖需选择应用'); return null }
      deps.push(note ? { type: 'internal', app_code: row.app_code, note } : { type: 'internal', app_code: row.app_code })
    } else {
      if (!row.name.trim() && !row.url.trim()) { Message.warning('外部依赖需至少填写名称或地址'); return null }
      const dep: IAppDependency = { type: 'external' }
      if (row.name.trim()) dep.name = row.name.trim()
      if (row.url.trim()) dep.url = row.url.trim()
      if (note) dep.note = note
      deps.push(dep)
    }
  }
  return deps
}

function handleAdd() {
  editingId.value = null
  Object.assign(formData, { app_code: '', name: '', team: '', owner: '', department: '', repo_url: '', description: '', business_id: undefined })
  pipelineRows.value = []
  dependencyRows.value = []
  fetchDependencyOptions()
  formVisible.value = true
}

function handleEdit(record: IBusinessApp) {
  editingId.value = record.id
  Object.assign(formData, { app_code: record.app_code, name: record.name, team: record.team || '', owner: record.owner || '', department: record.department || '', repo_url: record.repo_url || '', description: record.description || '', business_id: record.business_id ?? undefined })
  pipelineRows.value = Object.entries(record.pipelines || {}).map(([env, url]) => ({ env, url }))
  // 依赖声明回显：GET /apps/{id} 已透出 dependencies（v24）
  dependencyRows.value = (record.dependencies || []).map(d => ({
    type: (d.type === 'external' ? 'external' : 'internal') as DependencyRow['type'],
    app_code: d.app_code || '',
    name: d.name || '',
    url: d.url || '',
    note: d.note || '',
  }))
  fetchDependencyOptions()
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
  const dependencies = buildDependencies()
  if (!dependencies) return
  formLoading.value = true
  try {
    if (editingId.value) {
      await appApi.updateApp(editingId.value, { name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined, repo_url: formData.repo_url || null, pipelines, business_id: formData.business_id ?? null, dependencies })
    } else {
      await appApi.createApp({ app_code: formData.app_code, name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined, repo_url: formData.repo_url || null, pipelines, business_id: formData.business_id ?? null, dependencies })
    }
    Message.success(editingId.value ? '编辑成功' : '新增成功')
    formVisible.value = false
    fetchData()
  } catch { /* 拦截器已提示（后端 422/409：如 internal 依赖的 app_code 不存在） */ } finally { formLoading.value = false }
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
  { title: '部署流水线', slotName: 'pipeline', width: 90 },
  { title: '操作', slotName: 'actions', width: 60 },
]

// 有「构建→部署」语义的模型：只有它们渲染流水线跳转；中间件/存储类无此语义（显示 —）
const DEPLOYABLE_MODEL_CODES = new Set(['k8s_workload', 'k8s_service'])

function isDeployable(modelCode: string | null): boolean {
  return !!modelCode && DEPLOYABLE_MODEL_CODES.has(modelCode)
}

// 环境维度：env 来自资源 env/k8s:env 标签，客户端即时筛选
const envFilter = ref<string | undefined>()

const drawerEnvOptions = computed(() => {
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

// 列表行内直达：仓库复制、流水线新窗口打开
function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => Message.success('已复制')).catch(() => Message.error('复制失败'))
}

function openUrl(url: string) {
  if (url) window.open(url, '_blank')
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

// 流水线环境的候选值 = 标签定义 env 的允许值（与资源 env 标签值域联动，如后端新增 sit 自动出现）
const envOptions = ref<string[]>([])

async function fetchEnvOptions() {
  try {
    const defs = (await getTagDefinitions({ page: 1, page_size: 100 })).data.items
    const env = defs.find(d => d.tag_key === 'env')
    envOptions.value = env?.allowed_values ?? []
  } catch { /* 标签接口失败时保留空候选，允许手输兜底 */ }
}

onMounted(() => { fetchData(); fetchEnvOptions(); fetchDomains() })

// ========== 业务域（应用之上的唯一分组，v24） ==========
const domains = ref<IBusinessDomain[]>([])
const domainLoading = ref(false)
const domainModalVisible = ref(false)
const domainFormVisible = ref(false)
const domainFormLoading = ref(false)
const editingDomainId = ref<number | null>(null)
const domainFormRef = ref()
const domainForm = reactive({ name: '', code: '', owner: '', description: '' })
const domainRules = {
  name: [{ required: true, message: '请输入业务域名称' }],
  code: [{ required: true, message: '请输入编码' }],
}

const domainNameMap = computed(() => Object.fromEntries(domains.value.map(d => [d.id, d.name])))
// 业务域筛选为客户端过滤（应用量级小，无需后端参数）
const businessFilter = ref<number | undefined>()
const filteredApps = computed(() => (businessFilter.value ? apps.value.filter(a => a.business_id === businessFilter.value) : apps.value))

async function fetchDomains() {
  domainLoading.value = true
  try { domains.value = (await appApi.listBusinessDomains()).data } catch { /* ignore */ } finally { domainLoading.value = false }
}

function openDomainManager() {
  domainModalVisible.value = true
  fetchDomains()
}

function openDomainForm(record: IBusinessDomain | null) {
  editingDomainId.value = record?.id ?? null
  Object.assign(domainForm, { name: record?.name || '', code: record?.code || '', owner: record?.owner || '', description: record?.description || '' })
  domainFormVisible.value = true
}

async function handleDomainSubmit() {
  const errors = await domainFormRef.value?.validate()
  if (errors) return
  domainFormLoading.value = true
  try {
    if (editingDomainId.value) {
      await appApi.updateBusinessDomain(editingDomainId.value, { name: domainForm.name, owner: domainForm.owner || null, description: domainForm.description || null })
    } else {
      await appApi.createBusinessDomain({ name: domainForm.name, code: domainForm.code, owner: domainForm.owner || null, description: domainForm.description || null })
    }
    Message.success(editingDomainId.value ? '编辑成功' : '新增成功')
    domainFormVisible.value = false
    fetchDomains()
  } catch { /* 拦截器已提示 */ } finally { domainFormLoading.value = false }
}

// ========== 应用关系视图 ==========
const topoVisible = ref(false)
const topoAppId = ref<number | null>(null)

function openTopology(record: IBusinessApp) {
  topoAppId.value = record.id
  topoVisible.value = true
}
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

.copy-btn { color: $text-secondary; &:hover { color: $color-primary; } }

.pipeline-tag { cursor: pointer; }
.pipeline-na { color: $text-disabled; }

.pipeline-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .pipeline-row { display: flex; gap: $spacing-xs; align-items: center; :deep(.arco-input-wrapper) { flex: 1; } }
}

.dependency-editor {
  display: flex; flex-direction: column; gap: $spacing-xs; width: 100%;
  .dependency-row { display: flex; gap: $spacing-xs; align-items: center; }
}

.domain-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-sm; }
.domain-name { font-weight: 500; color: $text-primary; margin-right: 8px; }
.domain-code { font-size: $font-size-xs; color: $text-secondary; font-family: $font-mono; }
</style>
