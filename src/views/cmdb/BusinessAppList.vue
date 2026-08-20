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
        <template #labels="{ record }">
          <a-space v-if="record.labels" wrap>
            <a-tag v-for="(v, k) in record.labels" :key="k" size="small">{{ k }}: {{ v }}</a-tag>
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

    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑应用' : '新增应用'" :width="520" :ok-loading="formLoading" @ok="handleSubmit">
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
        <a-form-item field="description" label="描述"><a-textarea v-model="formData.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 应用关联资源抽屉 -->
    <a-drawer v-model:visible="drawerVisible" :title="`关联资源 - ${drawerApp?.name ?? ''}`" :width="760" unmount-on-close>
      <div class="bind-bar">
        <a-input-number v-model="bindResourceId" placeholder="资源 ID" :min="1" hide-button style="width: 160px" />
        <a-button type="primary" :loading="bindLoading" @click="handleBind">绑定资源</a-button>
        <span class="bind-tip">仅支持服务级 CI（workload / 中间件 / 数据库等）</span>
      </div>
      <a-table :data="appResources" :loading="drawerLoading" :columns="resourceColumns" :pagination="false" row-key="resource_id" size="small">
        <template #empty>
          <a-empty description="暂无关联资源，可通过标签自动归集或手动绑定" />
        </template>
        <template #name="{ record }">
          <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.resource_id) } })">{{ record.name }}</a-link>
        </template>
        <template #model_code="{ record }"><a-tag size="small" color="arcoblue">{{ record.model_code }}</a-tag></template>
        <template #provider="{ record }">{{ providerMap[record.provider] || record.provider }}</template>
        <template #status="{ record }">{{ statusMap[record.status] || record.status }}</template>
        <template #source="{ record }">
          <a-tag size="small" :color="record.source === 'tag' ? 'green' : 'blue'">{{ record.source === 'tag' ? '标签归集' : '手动绑定' }}</a-tag>
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
import { ref, reactive, onMounted } from 'vue'
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
  { title: '部门', dataIndex: 'department', width: 120 },
  { title: '标签', slotName: 'labels' },
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
const formData = reactive({ app_code: '', name: '', team: '', owner: '', department: '', description: '' })
const formRules = { app_code: [{ required: true, message: '请输入编码' }], name: [{ required: true, message: '请输入名称' }] }

function handleAdd() {
  editingId.value = null
  Object.assign(formData, { app_code: '', name: '', team: '', owner: '', department: '', description: '' })
  formVisible.value = true
}

function handleEdit(record: IBusinessApp) {
  editingId.value = record.id
  Object.assign(formData, { app_code: record.app_code, name: record.name, team: record.team || '', owner: record.owner || '', department: record.department || '', description: record.description || '' })
  formVisible.value = true
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  formLoading.value = true
  try {
    if (editingId.value) {
      await appApi.updateApp(editingId.value, { name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined })
    } else {
      await appApi.createApp({ app_code: formData.app_code, name: formData.name, team: formData.team || undefined, owner: formData.owner || undefined, department: formData.department || undefined, description: formData.description || undefined })
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
  { title: '云厂商', slotName: 'provider', width: 90 },
  { title: '状态', slotName: 'status', width: 80 },
  { title: '来源', slotName: 'source', width: 100 },
  { title: '操作', slotName: 'actions', width: 60 },
]

function openResources(app: IBusinessApp) {
  drawerApp.value = app
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
</style>
