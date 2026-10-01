<template>
  <div class="credential-list">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">凭据目录</span>
        <a-space>
          <a-select v-model="queryParams.kind" placeholder="全部类型" allow-clear style="width: 140px" @change="handleSearch">
            <a-option v-for="(m, k) in CREDENTIAL_KIND_MAP" :key="k" :value="k">{{ m.text }}</a-option>
          </a-select>
          <a-input-search v-model="queryParams.keyword" placeholder="搜索名称" allow-clear style="width: 180px" @search="handleSearch" />
          <a-button type="primary" @click="handleCreate">
            <template #icon><icon-plus /></template>新增凭据
          </a-button>
          <a-button @click="fetchData">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-alert class="cred-tip" type="info">
        只登记 Vault 引用与元数据，<b>任何字段都不接受明文凭据</b>（含 <code>-----BEGIN</code> / <code>PRIVATE KEY</code> 特征串会被拒）。
        主机通过标签 <code>ssh_credential = 凭据名称</code> 绑定钥匙、<code>ssh_user = 登录用户</code> 决定身份（v33：身份归主机，不在凭据上）。
      </a-alert>

      <a-table
        :data="tableData" :loading="loading" :columns="columns" :pagination="pagination" row-key="id"
        @page-change="(p: number) => { pagination.current = p; fetchData() }"
        @page-size-change="(s: number) => { pagination.pageSize = s; pagination.current = 1; fetchData() }"
      >
        <template #name="{ record }">
          <span class="cred-name mono">{{ record.name }}</span>
          <a-tag v-if="record.is_default" size="small" color="gold" class="default-tag">默认</a-tag>
        </template>
        <template #kind="{ record }">
          <a-tag size="small" :color="CREDENTIAL_KIND_MAP[record.kind]?.color">{{ credentialKindText(record.kind) }}</a-tag>
        </template>
        <template #ref="{ record }">
          <div class="mono ref-path">{{ record.vault_path }}<span v-if="record.vault_field">#{{ record.vault_field }}</span></div>
          <div v-if="record.cloud_account || record.region" class="ref-scope">{{ [record.cloud_account, record.region].filter(Boolean).join(' / ') }}</div>
        </template>
        <template #verify="{ record }">
          <a-tag size="small" :color="VERIFY_STATE_MAP[record.verify_state]?.color">{{ VERIFY_STATE_MAP[record.verify_state]?.text || record.verify_state }}</a-tag>
          <span v-if="record.last_verified_at" class="verify-time">{{ formatTime(record.last_verified_at) }}</span>
        </template>
        <template #is_active="{ record }">
          <a-switch :model-value="record.is_active" size="small" :loading="togglingId === record.id" @change="(v: string | number | boolean) => handleToggle(record, Boolean(v))" />
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="openUsage(record)"><template #icon><icon-search /></template>引用</a-button>
            <a-button type="text" size="small" @click="handleEdit(record)"><template #icon><icon-edit /></template></a-button>
            <a-popconfirm content="删除后不可恢复；仍被引用时会被拒绝，请改用停用" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑弹窗：字段随 kind 变（后端字段统一，这里按类型裁剪标签/必填/适用范围） -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑凭据' : '新增凭据'" :width="600" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item label="凭据名称（全局唯一，主机标签引用它）" required>
              <a-input v-model="formData.name" placeholder="如 povison_key_pair" />
            </a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="类型" required>
              <a-select v-model="formData.kind">
                <a-option v-for="(m, k) in CREDENTIAL_KIND_MAP" :key="k" :value="k">{{ m.text }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-alert class="kind-guide" :content="kindForm.guide" type="info" />

        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item :label="kindForm.pathLabel" required>
              <a-input v-model="formData.vault_path" :placeholder="kindForm.pathPlaceholder" />
              <template #extra><span class="hint">只填路径，绝不填凭据值{{ kindForm.pathHint ? '；' + kindForm.pathHint : '' }}</span></template>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="kindForm.fieldLabel" :required="kindForm.fieldRequired">
              <a-input v-model="formData.vault_field" :placeholder="kindForm.fieldPlaceholder" />
            </a-form-item>
          </a-col>
        </a-row>
        <p v-if="kindForm.fieldHint" class="hint field-hint">{{ kindForm.fieldHint }}</p>

        <template v-if="kindForm.showScope">
          <a-divider orientation="left" class="scope-divider">适用范围（可空 = 不限）</a-divider>
          <a-row :gutter="16">
            <a-col :span="12"><a-form-item label="云账号"><a-input v-model="formData.cloud_account" :placeholder="kindForm.scopePlaceholder || '适用范围'" /></a-form-item></a-col>
            <a-col :span="12"><a-form-item label="区域"><a-input v-model="formData.region" placeholder="如 cn-guangzhou" /></a-form-item></a-col>
          </a-row>
        </template>

        <a-form-item label="备注"><a-textarea v-model="formData.remark" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
        <a-form-item>
          <a-checkbox v-model="formData.is_default">设为该类型默认（同 kind 唯一；多命中无默认时执行报 400）</a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 引用反查抽屉（轮换前必看） -->
    <a-drawer v-model:visible="usageVisible" :title="`引用反查 - ${usage?.credential_name ?? ''}`" :width="560" :footer="false" unmount-on-close>
      <a-spin :loading="usageLoading" style="width: 100%">
        <a-row :gutter="16" class="usage-stat">
          <a-col :span="12"><a-statistic title="主机标签引用" :value="usage?.host_tag_refs ?? 0" /></a-col>
          <a-col :span="12"><a-statistic title="Runbook 引用" :value="usage?.runbook_refs ?? 0" /></a-col>
        </a-row>
        <p class="hint">有引用时不允许删除，只能停用（is_active=false）以保留引用历史。</p>
        <a-table :data="usage?.hosts ?? []" :columns="hostColumns" :pagination="false" size="small" row-key="resource_id" class="usage-table">
          <template #empty><a-empty description="暂无主机引用" /></template>
        </a-table>
      </a-spin>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconRefresh, IconSearch } from '@arco-design/web-vue/es/icon'
import * as credApi from '../../api/credential'
import { CREDENTIAL_KIND_MAP, VERIFY_STATE_MAP, credentialKindText } from '../../api/credential'
import type { ICredential, ICredentialCreate, ICredentialUsage, CredentialKind } from '../../api/credential'

const loading = ref(false)
const tableData = ref<ICredential[]>([])
const queryParams = reactive({ kind: undefined as string | undefined, keyword: '' })
const pagination = reactive({ current: 1, pageSize: 15, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '名称', slotName: 'name', width: 220 },
  { title: '类型', slotName: 'kind', width: 120 },
  { title: 'Vault 引用', slotName: 'ref', width: 260 },
  { title: '验证状态', slotName: 'verify', width: 160 },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '操作', slotName: 'actions', width: 170 },
]

const hostColumns = [
  { title: '主机', dataIndex: 'name', ellipsis: true },
  { title: 'IP', dataIndex: 'ip', width: 130 },
  { title: '模型', dataIndex: 'model_code', width: 130 },
]

function formatTime(t: string) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

async function fetchData() {
  loading.value = true
  try {
    const res = await credApi.getCredentials({
      kind: queryParams.kind, keyword: queryParams.keyword || undefined,
      page: pagination.current, page_size: pagination.pageSize,
    })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }

// ========== 按 kind 区分的表单规格（后端字段统一，这里裁剪标签/必填/适用范围/引导） ==========
interface IKindForm {
  pathLabel: string; pathPlaceholder: string; pathHint?: string
  fieldLabel: string; fieldPlaceholder: string; fieldRequired: boolean; fieldHint?: string
  showScope: boolean; scopePlaceholder?: string
  guide: string
}
const KIND_FORM: Record<string, IKindForm> = {
  ssh_key: {
    pathLabel: '私钥 Vault 路径', pathPlaceholder: 'ssh/keys/povison', pathHint: '私钥文件型指向密钥文件路径',
    fieldLabel: '字段名（可选）', fieldPlaceholder: 'private_key', fieldRequired: false,
    fieldHint: 'KV 引擎把私钥存成某字段时才填；整段私钥作为文件读取则留空',
    showScope: true, scopePlaceholder: '这把钥匙能登哪些云账号',
    guide: 'SSH 目标机钥匙。登录用户不在此填——由主机标签 ssh_user 决定（v33）；中转网关的跳板凭据也引用此类条目。',
  },
  cloud_ak: {
    pathLabel: '云 AK 的 Vault 路径', pathPlaceholder: 'aliyun/prod-ops',
    fieldLabel: '字段名', fieldPlaceholder: 'access_key_id', fieldRequired: true,
    fieldHint: 'AK 与 SK 通常建两条凭据，指向同一 path 的不同 field（access_key_id / access_key_secret）',
    showScope: true, scopePlaceholder: '如 aliyun 主账号 ID',
    guide: '云访问密钥。执行期按目标机归属（云账号 + 区域）唯一命中；只登记引用，真值在 Vault。',
  },
  db_password: {
    pathLabel: '数据库口令 Vault 路径', pathPlaceholder: 'magento2/prod/readonly',
    fieldLabel: '字段名', fieldPlaceholder: 'password', fieldRequired: true,
    fieldHint: 'DB 条目几乎都是 KV 多字段（user / password），必须指定要取哪个字段',
    showScope: false,
    guide: '数据库口令。作为 runbook secrets 入参被引用，执行时按同名环境变量注入脚本/playbook。',
  },
  api_token: {
    pathLabel: 'API Token Vault 路径', pathPlaceholder: 'gitlab/bot-token',
    fieldLabel: '字段名', fieldPlaceholder: 'token', fieldRequired: true,
    fieldHint: '指向存放令牌的字段',
    showScope: false,
    guide: '第三方 API 令牌。只登记 Vault 引用，绝不存明文。',
  },
  kubeconfig: {
    pathLabel: 'kubeconfig Vault 路径', pathPlaceholder: 'k8s/prod-cluster',
    fieldLabel: '字段名（可选）', fieldPlaceholder: 'config', fieldRequired: false,
    fieldHint: '整份 kubeconfig 作为一个值时留空；KV 存多字段时指定',
    showScope: false,
    guide: 'K8s 集群访问配置（kubeconfig）。',
  },
}
const kindForm = computed<IKindForm>(() => KIND_FORM[formData.kind] || KIND_FORM.ssh_key)

// ========== 启停 ==========
const togglingId = ref<number | null>(null)
async function handleToggle(record: ICredential, isActive: boolean) {
  togglingId.value = record.id
  try {
    await credApi.updateCredential(record.id, { is_active: isActive })
    record.is_active = isActive
    Message.success(isActive ? '已启用' : '已停用')
  } catch { /* 拦截器已提示 */ } finally { togglingId.value = null }
}

// ========== 表单 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formData = reactive({
  name: '', kind: 'ssh_key' as CredentialKind, vault_path: '', vault_field: '',
  cloud_account: '', region: '', is_default: false, remark: '',
})

function resetForm() {
  Object.assign(formData, {
    name: '', kind: 'ssh_key', vault_path: '', vault_field: '',
    cloud_account: '', region: '', is_default: false, remark: '',
  })
}

function handleCreate() { editingId.value = null; resetForm(); formVisible.value = true }

function handleEdit(record: ICredential) {
  editingId.value = record.id
  Object.assign(formData, {
    name: record.name, kind: record.kind, vault_path: record.vault_path, vault_field: record.vault_field || '',
    cloud_account: record.cloud_account || '', region: record.region || '',
    is_default: record.is_default, remark: record.remark || '',
  })
  formVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim()) { Message.warning('请填写凭据名称'); return }
  if (!formData.vault_path.trim()) { Message.warning(`请填写${kindForm.value.pathLabel}`); return }
  if (kindForm.value.fieldRequired && !formData.vault_field.trim()) {
    Message.warning(`${kindForm.value.fieldLabel.replace(/（.*/, '')}不能为空`)
    return
  }
  const payload: ICredentialCreate = {
    name: formData.name.trim(),
    kind: formData.kind,
    vault_path: formData.vault_path.trim(),
    vault_field: formData.vault_field.trim() || null,
    cloud_account: formData.cloud_account.trim() || null,
    region: formData.region.trim() || null,
    is_default: formData.is_default,
    remark: formData.remark.trim() || null,
  }
  formLoading.value = true
  try {
    if (editingId.value) {
      await credApi.updateCredential(editingId.value, payload)
      Message.success('已更新')
    } else {
      await credApi.createCredential(payload)
      Message.success('已创建')
    }
    formVisible.value = false
    fetchData()
  } catch { /* 拦截器已提示 */ } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await credApi.deleteCredential(id); Message.success('已删除'); fetchData() } catch { /* 拦截器已提示（被引用时后端拒绝） */ }
}

// ========== 引用反查 ==========
const usageVisible = ref(false)
const usageLoading = ref(false)
const usage = ref<ICredentialUsage | null>(null)

async function openUsage(record: ICredential) {
  usage.value = null
  usageVisible.value = true
  usageLoading.value = true
  try {
    const res = await credApi.getCredentialUsage(record.id)
    usage.value = res.data
  } catch { /* 拦截器已提示 */ } finally { usageLoading.value = false }
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.credential-list { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.cred-tip { margin-bottom: $spacing-md; code { font-family: $font-mono; background: rgba(22, 119, 255, 0.06); padding: 0 4px; border-radius: 3px; } }

.hint { font-size: $font-size-xs; color: $text-hint; }
.mono { font-family: $font-mono; }
.cred-name { font-weight: 500; color: $text-primary; }
.default-tag { margin-left: 6px; }
.ref-path { color: $text-body; word-break: break-all; }
.ref-scope { font-size: $font-size-xs; color: $text-hint; margin-top: 2px; }
.verify-time { display: block; font-size: $font-size-xs; color: $text-hint; margin-top: 2px; }

.kind-guide { margin-bottom: $spacing-md; font-size: $font-size-xs; }
.field-hint { margin: -8px 0 $spacing-sm; }
.scope-divider { margin: $spacing-xs 0 $spacing-sm; font-size: $font-size-sm; color: $text-hint; }

.usage-stat { margin-bottom: $spacing-md; }
.usage-table { margin-top: $spacing-sm; }
</style>
