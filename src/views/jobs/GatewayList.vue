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
        网关是<b>网络拓扑事实</b>，不是任务属性——runbook 不再写 <code>proxy_hop</code>，执行期按机器所属 VPC 自动选路。
        关联维度只有 <b>VPC</b> 一个：<b>一个 VPC 只允许一条启用网关接管</b>，重复会被后端拒绝并指名是哪条。
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
        <template #vpc="{ record }">
          <a-space wrap size="mini">
            <a-tag v-for="v in record.vpc_ids" :key="v" size="small" class="mono">{{ vpcLabel(v) }}</a-tag>
          </a-space>
        </template>
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

    <!-- 新增/编辑网关：v35 只剩 6 个框（名称/主机/端口/登录用户/跳板凭据/接管 VPC + 备注） -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑网关' : '新增网关'" :width="620" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-form-item label="名称" required><a-input v-model="formData.name" placeholder="如 gw-nocid" /></a-form-item>
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
        <a-form-item label="接管 VPC（多选，来源 CMDB 的 aliyun_vpc / gcp_vpc）" required>
          <a-select v-model="vpcIds" multiple allow-search :loading="vpcLoading" placeholder="选择该跳板接管的 VPC（至少一个）">
            <a-option v-for="o in vpcOptions" :key="o.value" :value="o.value">{{ o.label }}</a-option>
          </a-select>
          <template #extra><span class="hint">不让人手打 VPC ID；一个 VPC 只能被一条启用网关接管，冲突时后端 409 会指名</span></template>
        </a-form-item>
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
import { getModels } from '../../api/model'
import { getResourceList } from '../../api/cmdb'

const loading = ref(false)
const tableData = ref<IJobGateway[]>([])
const queryParams = reactive({ keyword: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称 / 地址', slotName: 'name', width: 220 },
  { title: '跳板凭据', slotName: 'cred', width: 160 },
  { title: '接管 VPC', slotName: 'vpc' },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '操作', slotName: 'actions', width: 110 },
]

// VPC id → 展示名（表格里把裸 vpc-id 映射成人能认的名称）
const vpcNameMap = ref<Record<string, string>>({})
function vpcLabel(v: string): string {
  return vpcNameMap.value[v] ? `${vpcNameMap.value[v]}（${v}）` : v
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
  } catch { /* 拦截器已提示（含停用/启用撞别的网关 VPC 时的 409） */ } finally { togglingId.value = null }
}

// ========== VPC 选项：CMDB aliyun_vpc / gcp_vpc 资源，值取 provider_id（与 ECS fields.vpc_id 同源） ==========
const VPC_MODEL_CODES = ['aliyun_vpc', 'gcp_vpc']
interface IVpcOption { value: string; label: string }
const vpcOptions = ref<IVpcOption[]>([])
const vpcLoading = ref(false)

async function fetchVpcOptions() {
  vpcLoading.value = true
  try {
    const models = (await getModels()).data
    const vpcModelIds = models.filter(m => VPC_MODEL_CODES.includes(m.code)).map(m => m.id)
    const nameMap: Record<string, string> = { ...vpcNameMap.value }
    const opts: IVpcOption[] = []
    for (const mid of vpcModelIds) {
      // page_size 上限 100，VPC 量小，翻页累加兜底（最多 3 页）
      const first = await getResourceList({ model_id: mid, page: 1, page_size: 100 })
      const all = [...first.data.items]
      const total = first.data.pagination.total
      for (let p = 2; all.length < total && p <= 3; p++) {
        const nx = await getResourceList({ model_id: mid, page: p, page_size: 100 })
        all.push(...nx.data.items)
      }
      for (const r of all) {
        const vid = r.provider_id
        if (!vid) continue
        opts.push({ value: vid, label: `${r.name}（${vid}）` })
        nameMap[vid] = r.name
      }
    }
    vpcOptions.value = opts
    vpcNameMap.value = nameMap
  } catch { /* ignore */ } finally { vpcLoading.value = false }
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formData = reactive({ name: '', host: '', port: 22, login_user: 'root', ssh_credential: '', remark: '' })
const vpcIds = ref<string[]>([])

// 跳板凭据下拉数据源：凭据目录里的 ssh_key
const sshCredentials = ref<ICredential[]>([])
async function fetchSshCredentials() {
  try {
    const res = await getCredentials({ kind: 'ssh_key', page: 1, page_size: 100 })
    sshCredentials.value = res.data.items
  } catch { /* ignore */ }
}

function resetForm() {
  Object.assign(formData, { name: '', host: '', port: 22, login_user: 'root', ssh_credential: '', remark: '' })
  vpcIds.value = []
}

function handleCreate() { editingId.value = null; resetForm(); formVisible.value = true }

function handleEdit(record: IJobGateway) {
  editingId.value = record.id
  Object.assign(formData, {
    name: record.name, host: record.host, port: record.port, login_user: record.login_user,
    ssh_credential: record.ssh_credential || '', remark: record.remark || '',
  })
  vpcIds.value = [...(record.vpc_ids || [])]
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim()) { Message.warning('请填写名称'); return }
  if (!formData.host.trim()) { Message.warning('请填写网关主机'); return }
  // 去重去空
  const cleaned = [...new Set(vpcIds.value.map(v => v.trim()).filter(Boolean))]
  if (!cleaned.length) { Message.warning('请至少选择一个接管 VPC（留空该网关匹配不到任何机器）'); return }
  const payload: IGatewayCreate = {
    name: formData.name.trim(), host: formData.host.trim(), port: formData.port,
    login_user: formData.login_user.trim() || 'root', ssh_credential: formData.ssh_credential.trim() || null,
    vpc_ids: cleaned, remark: formData.remark.trim() || null,
  }
  formLoading.value = true
  try {
    if (editingId.value) { await gwApi.updateGateway(editingId.value, payload); Message.success('已更新') }
    else { await gwApi.createGateway(payload); Message.success('已创建') }
    formVisible.value = false
    fetchData()
  } catch { /* 拦截器已提示（VPC 已被别的网关占用返回 409，消息指名是哪条） */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await gwApi.deleteGateway(id); Message.success('已删除'); fetchData() } catch { /* 拦截器已提示 */ }
}

onMounted(() => { fetchData(); fetchSshCredentials(); fetchVpcOptions() })
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
</style>
