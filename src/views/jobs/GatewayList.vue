<template>
  <div class="gateway-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">中转网关</span>
        <a-space>
          <a-input-search v-model="queryParams.keyword" placeholder="搜索名称/主机" allow-clear style="width: 200px" @search="handleSearch" />
          <a-button type="primary" @click="handleCreate"><template #icon><icon-plus /></template>新增网关</a-button>
          <a-button @click="fetchData"><template #icon><icon-refresh /></template></a-button>
        </a-space>
      </div>
      <a-alert class="gw-tip" type="info">
        网关是<b>网络拓扑事实</b>，不是任务属性——runbook 不再写 <code>proxy_hop</code>，执行期按机器归属自动选路。
        <code>scope</code> 命中任一维度即服务；<b>空 scope 不匹配任何机器</b>（不提供全局兜底，避免误配接管全部流量）。
      </a-alert>
      <a-table :data="tableData" :loading="loading" :columns="columns" :pagination="pagination" row-key="id" @page-change="(p: number) => { pagination.current = p; fetchData() }" @page-size-change="(s: number) => { pagination.pageSize = s; pagination.current = 1; fetchData() }">
        <template #name="{ record }">
          <span class="gw-name">{{ record.name }}</span>
          <p class="gw-host mono">{{ record.login_user }}@{{ record.host }}:{{ record.port }}</p>
        </template>
        <template #cred="{ record }">
          <span v-if="record.ssh_credential" class="mono">{{ record.ssh_credential }}</span>
          <span v-else class="hint">复用目标机钥匙</span>
        </template>
        <template #scope="{ record }">
          <a-space wrap size="mini">
            <a-tag v-for="t in scopeTags(record.scope)" :key="t" size="small">{{ t }}</a-tag>
            <span v-if="!scopeTags(record.scope).length" class="hint">空（不匹配）</span>
          </a-space>
        </template>
        <template #priority="{ record }">{{ record.priority }}</template>
        <template #is_active="{ record }">
          <a-switch :model-value="record.is_active" size="small" :loading="togglingId === record.id" @change="(v: string | number | boolean) => handleToggle(record, Boolean(v))" />
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleEdit(record)"><template #icon><icon-edit /></template></a-button>
            <a-popconfirm content="确定删除该网关？" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑网关 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑网关' : '新增网关'" :width="620" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="名称" required><a-input v-model="formData.name" placeholder="如 gw-nocid" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="优先级（多命中升序取首）"><a-input-number v-model="formData.priority" :min="0" :max="1000" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="14"><a-form-item label="主机 / IP" required><a-input v-model="formData.host" placeholder="如 10.0.0.1" /></a-form-item></a-col>
          <a-col :span="5"><a-form-item label="端口"><a-input-number v-model="formData.port" :min="1" :max="65535" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="5"><a-form-item label="登录用户"><a-input v-model="formData.login_user" placeholder="root" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="跳板凭据（引用凭据目录，可空）">
          <a-select v-model="formData.ssh_credential" placeholder="留空 = 网关用目标机同一把钥匙" allow-clear allow-search>
            <a-option v-for="c in sshCredentials" :key="c.id" :value="c.name">{{ c.name }}{{ c.cloud_account ? `（${c.cloud_account}）` : '' }}</a-option>
          </a-select>
        </a-form-item>
        <a-divider orientation="left" class="scope-divider">适用范围（至少填一个维度）</a-divider>
        <a-form-item label="VPC ID"><a-input-tag v-model="scopeForm.vpc_ids" placeholder="回车添加" allow-clear /></a-form-item>
        <a-form-item label="云账号"><a-input-tag v-model="scopeForm.cloud_accounts" placeholder="回车添加" allow-clear /></a-form-item>
        <a-form-item label="区域"><a-input-tag v-model="scopeForm.regions" placeholder="如 cn-guangzhou" allow-clear /></a-form-item>
        <a-form-item label="指定资源 ID"><a-input-tag v-model="scopeResourceIds" placeholder="数字，回车添加" allow-clear /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model="formData.remark" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 3 }" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as gwApi from '../../api/gateway'
import type { IJobGateway, IGatewayCreate } from '../../api/gateway'
import { getCredentials } from '../../api/credential'
import type { ICredential } from '../../api/credential'

const loading = ref(false)
const tableData = ref<IJobGateway[]>([])
const queryParams = reactive({ keyword: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称 / 地址', slotName: 'name', width: 220 },
  { title: '跳板凭据', slotName: 'cred', width: 160 },
  { title: '适用范围', slotName: 'scope', ellipsis: false },
  { title: '优先级', slotName: 'priority', width: 80 },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

function scopeTags(scope: Partial<Record<string, unknown>>): string[] {
  const s = scope as { vpc_ids?: string[]; cloud_accounts?: string[]; regions?: string[]; resource_ids?: number[] }
  const out: string[] = []
  ;(s.vpc_ids || []).forEach(v => out.push(`vpc:${v}`))
  ;(s.cloud_accounts || []).forEach(v => out.push(`账号:${v}`))
  ;(s.regions || []).forEach(v => out.push(`region:${v}`))
  ;(s.resource_ids || []).forEach(v => out.push(`#${v}`))
  return out
}

async function fetchData() {
  loading.value = true
  try {
    const res = await gwApi.getGateways({ keyword: queryParams.keyword || undefined, page: pagination.current, page_size: pagination.pageSize })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }

const togglingId = ref<number | null>(null)
async function handleToggle(record: IJobGateway, isActive: boolean) {
  togglingId.value = record.id
  try {
    await gwApi.updateGateway(record.id, { is_active: isActive })
    record.is_active = isActive
    Message.success(isActive ? '已启用' : '已停用')
  } catch { /* 拦截器已提示 */ } finally { togglingId.value = null }
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formData = reactive({ name: '', host: '', port: 22, login_user: 'root', ssh_credential: '', priority: 100, remark: '' })
const scopeForm = reactive({ vpc_ids: [] as string[], cloud_accounts: [] as string[], regions: [] as string[] })
const scopeResourceIds = ref<string[]>([])

// 跳板凭据下拉数据源：凭据目录里的 ssh_key
const sshCredentials = ref<ICredential[]>([])
async function fetchSshCredentials() {
  try {
    const res = await getCredentials({ kind: 'ssh_key', page: 1, page_size: 100 })
    sshCredentials.value = res.data.items
  } catch { /* ignore */ }
}

function resetForm() {
  Object.assign(formData, { name: '', host: '', port: 22, login_user: 'root', ssh_credential: '', priority: 100, remark: '' })
  scopeForm.vpc_ids = []; scopeForm.cloud_accounts = []; scopeForm.regions = []
  scopeResourceIds.value = []
}

function handleCreate() { editingId.value = null; resetForm(); formVisible.value = true }

function handleEdit(record: IJobGateway) {
  editingId.value = record.id
  const s = record.scope as { vpc_ids?: string[]; cloud_accounts?: string[]; regions?: string[]; resource_ids?: number[] }
  Object.assign(formData, {
    name: record.name, host: record.host, port: record.port, login_user: record.login_user,
    ssh_credential: record.ssh_credential || '', priority: record.priority, remark: record.remark || '',
  })
  scopeForm.vpc_ids = [...(s.vpc_ids || [])]
  scopeForm.cloud_accounts = [...(s.cloud_accounts || [])]
  scopeForm.regions = [...(s.regions || [])]
  scopeResourceIds.value = (s.resource_ids || []).map(String)
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim()) { Message.warning('请填写名称'); return }
  if (!formData.host.trim()) { Message.warning('请填写网关主机'); return }
  const resourceIds = scopeResourceIds.value.map(Number).filter(n => Number.isInteger(n) && n > 0)
  const scope = {
    vpc_ids: scopeForm.vpc_ids, cloud_accounts: scopeForm.cloud_accounts,
    regions: scopeForm.regions, resource_ids: resourceIds,
  }
  if (!scope.vpc_ids.length && !scope.cloud_accounts.length && !scope.regions.length && !scope.resource_ids.length) {
    Message.warning('scope 至少要填一个维度（空 scope 不匹配任何机器）')
    return
  }
  const payload: IGatewayCreate = {
    name: formData.name.trim(), host: formData.host.trim(), port: formData.port,
    login_user: formData.login_user.trim() || 'root', ssh_credential: formData.ssh_credential.trim() || null,
    scope, priority: formData.priority, remark: formData.remark.trim() || null,
  }
  formLoading.value = true
  try {
    if (editingId.value) { await gwApi.updateGateway(editingId.value, payload); Message.success('已更新') }
    else { await gwApi.createGateway(payload); Message.success('已创建') }
    formVisible.value = false
    fetchData()
  } catch { /* 拦截器已提示 */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await gwApi.deleteGateway(id); Message.success('已删除'); fetchData() } catch { /* 拦截器已提示 */ }
}

onMounted(() => { fetchData(); fetchSshCredentials() })
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.gateway-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.gw-tip { margin-bottom: $spacing-md; code { font-family: $font-mono; background: rgba(22, 119, 255, 0.06); padding: 0 4px; border-radius: 3px; } }

.gw-name { font-weight: 500; color: $text-primary; }
.gw-host { margin: 2px 0 0; font-size: $font-size-xs; color: $text-hint; }
.mono { font-family: $font-mono; }
.hint { font-size: $font-size-xs; color: $text-hint; }
.scope-divider { margin: $spacing-xs 0 $spacing-sm; font-size: $font-size-sm; color: $text-hint; }
</style>
