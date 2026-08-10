<template>
  <div class="role-list">
    <a-card class="filter-card" :bordered="false">
      <div class="filter-bar">
        <h3 class="page-title">角色管理</h3>
        <a-button type="primary" @click="handleCreate">
          <template #icon><icon-plus /></template>
          新增角色
        </a-button>
      </div>
    </a-card>

    <a-card class="table-card" :bordered="false">
      <a-table :data="tableData" :columns="columns" :loading="loading" :pagination="false" row-key="id">
        <template #code="{ record }">
          <span class="mono-text">{{ record.code }}</span>
        </template>
        <template #permissions="{ record }">
          <a-space wrap>
            <a-tag v-for="perm in record.permissions?.slice(0, 3)" :key="perm" size="small">{{ perm }}</a-tag>
            <a-tag v-if="(record.permissions?.length || 0) > 3" size="small" color="gray">
              +{{ record.permissions.length - 3 }}
            </a-tag>
            <span v-if="!record.permissions?.length" class="text-muted">未分配</span>
          </a-space>
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleEdit(record)">
              <template #icon><icon-edit /></template>
            </a-button>
            <a-button type="text" size="small" @click="handleAssignPerms(record)">
              <template #icon><icon-safe /></template>
            </a-button>
            <a-popconfirm
              v-if="!isSystemRole(record.code)"
              content="确定删除该角色？"
              @ok="handleDelete(record.id)"
            >
              <a-button type="text" size="small" status="danger">
                <template #icon><icon-delete /></template>
              </a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增角色弹窗 -->
    <a-modal v-model:visible="createVisible" title="新增角色" :ok-loading="createLoading" @ok="handleCreateSubmit">
      <a-form :model="createForm" :rules="createRules" layout="vertical" ref="createFormRef">
        <a-form-item field="code" label="角色编码">
          <a-input v-model="createForm.code" placeholder="小写字母开头，如 admin" />
        </a-form-item>
        <a-form-item field="name" label="角色名称">
          <a-input v-model="createForm.name" placeholder="如 系统管理员" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-textarea v-model="createForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑角色弹窗 -->
    <a-modal v-model:visible="editVisible" title="编辑角色" :ok-loading="editLoading" @ok="handleEditSubmit">
      <a-form :model="editForm" layout="vertical" ref="editFormRef">
        <a-form-item field="name" label="角色名称">
          <a-input v-model="editForm.name" placeholder="请输入角色名称" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-textarea v-model="editForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 分配权限弹窗 -->
    <a-modal
      v-model:visible="permVisible"
      title="分配权限"
      :width="560"
      :ok-loading="permLoading"
      @ok="handlePermSubmit"
    >
      <p class="assign-hint">为 <strong>{{ permTargetRole?.name }}</strong> 分配权限（全量替换）</p>
      <div v-if="allPermissions.length === 0" class="empty-perms">暂无权限数据</div>
      <div v-else class="perm-groups">
        <div v-for="group in permGroups" :key="group.module" class="perm-group">
          <div class="perm-module-title">{{ group.module }}</div>
          <a-checkbox-group v-model="selectedPermCodes" direction="vertical">
            <a-checkbox v-for="perm in group.items" :key="perm.code" :value="perm.code">
              {{ perm.name }}
              <span class="perm-code">{{ perm.code }}</span>
            </a-checkbox>
          </a-checkbox-group>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { IRole } from '../../types/role'
import type { IPermission } from '../../types/role'
import { getRoleList, createRole, updateRole, deleteRole, assignRolePermissions, getAllPermissions } from '../../api/role'
import { IconPlus, IconEdit, IconDelete, IconSafe } from '@arco-design/web-vue/es/icon'

const SYSTEM_ROLES = ['admin', 'super_admin']
function isSystemRole(code: string) { return SYSTEM_ROLES.includes(code) }

const loading = ref(false)
const tableData = ref<IRole[]>([])

const columns = [
  { title: '编码', slotName: 'code', width: 150 },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '描述', dataIndex: 'description', width: 250 },
  { title: '权限', slotName: 'permissions', width: 280 },
  { title: '操作', slotName: 'actions', width: 130, fixed: 'right' },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await getRoleList()
    tableData.value = res.data
  } finally { loading.value = false }
}

// --- 新增 ---
const createVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref()
const createForm = reactive({ code: '', name: '', description: '' })
const createRules = {
  code: [{ required: true, message: '请输入角色编码' }, { match: /^[a-z][a-z0-9_]*$/, message: '小写字母开头，仅含小写字母数字下划线' }],
  name: [{ required: true, message: '请输入角色名称' }],
}

function handleCreate() {
  Object.assign(createForm, { code: '', name: '', description: '' })
  createVisible.value = true
}

async function handleCreateSubmit() {
  const errors = await createFormRef.value?.validate()
  if (errors) return
  createLoading.value = true
  try {
    await createRole(createForm)
    Message.success('创建成功')
    createVisible.value = false
    fetchData()
  } finally { createLoading.value = false }
}

// --- 编辑 ---
const editVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref()
const editingId = ref(0)
const editForm = reactive({ name: '', description: '' })

function handleEdit(record: IRole) {
  editingId.value = record.id
  Object.assign(editForm, { name: record.name, description: record.description || '' })
  editVisible.value = true
}

async function handleEditSubmit() {
  editLoading.value = true
  try {
    await updateRole(editingId.value, editForm)
    Message.success('更新成功')
    editVisible.value = false
    fetchData()
  } finally { editLoading.value = false }
}

// --- 删除 ---
async function handleDelete(id: number) {
  await deleteRole(id)
  Message.success('删除成功')
  fetchData()
}

// --- 分配权限 ---
const permVisible = ref(false)
const permLoading = ref(false)
const permTargetRole = ref<IRole | null>(null)
const selectedPermCodes = ref<string[]>([])
const allPermissions = ref<IPermission[]>([])

const permGroups = computed(() => {
  const map = new Map<string, IPermission[]>()
  allPermissions.value.forEach((p) => {
    const list = map.get(p.module) || []
    list.push(p)
    map.set(p.module, list)
  })
  return Array.from(map.entries()).map(([module, items]) => ({ module, items }))
})

async function handleAssignPerms(record: IRole) {
  permTargetRole.value = record
  selectedPermCodes.value = [...(record.permissions || [])]
  const res = await getAllPermissions()
  allPermissions.value = res.data
  permVisible.value = true
}

async function handlePermSubmit() {
  if (!permTargetRole.value) return
  permLoading.value = true
  try {
    await assignRolePermissions(permTargetRole.value.id, { permission_codes: selectedPermCodes.value })
    Message.success('权限分配成功')
    permVisible.value = false
    fetchData()
  } finally { permLoading.value = false }
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.role-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.filter-card, .table-card {
  background: $bg-card;
  backdrop-filter: blur(12px);
  border: 1px solid $border-color;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  color: $text-primary;
  font-size: $font-size-lg;
  font-weight: 600;
}

.mono-text {
  font-family: $font-mono;
  color: $color-primary;
}

.text-muted {
  color: $text-disabled;
  font-size: $font-size-sm;
}

.assign-hint {
  color: $text-secondary;
  margin-bottom: $spacing-md;
  strong { color: $color-primary; }
}

.empty-perms {
  color: $text-disabled;
  text-align: center;
  padding: $spacing-xl;
}

.perm-groups {
  max-height: 400px;
  overflow-y: auto;
}

.perm-group {
  margin-bottom: $spacing-md;
}

.perm-module-title {
  color: $color-primary;
  font-size: $font-size-sm;
  font-weight: 600;
  margin-bottom: $spacing-sm;
  padding-bottom: $spacing-xs;
  border-bottom: 1px solid $border-color-light;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.perm-code {
  color: $text-disabled;
  font-size: $font-size-xs;
  font-family: $font-mono;
  margin-left: 4px;
}
</style>
