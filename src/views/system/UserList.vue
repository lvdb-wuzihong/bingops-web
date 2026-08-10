<template>
  <div class="user-list">
    <!-- 搜索栏 -->
    <a-card class="filter-card" :bordered="false">
      <div class="filter-bar">
        <a-input-search
          v-model="keyword"
          placeholder="搜索用户名 / 邮箱"
          allow-clear
          style="width: 300px"
          @search="fetchData"
        />
        <a-button type="primary" @click="handleCreate">
          <template #icon><icon-plus /></template>
          新增用户
        </a-button>
      </div>
    </a-card>

    <!-- 表格 -->
    <a-card class="table-card" :bordered="false">
      <a-table
        :data="tableData"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #roles="{ record }">
          <a-space wrap>
            <a-tag v-for="role in record.roles" :key="role.code" size="small" color="arcoblue">
              {{ role.name }}
            </a-tag>
            <span v-if="!record.roles?.length" class="text-muted">未分配</span>
          </a-space>
        </template>
        <template #is_active="{ record }">
          <a-badge :status="record.is_active ? 'success' : 'danger'" :text="record.is_active ? '启用' : '禁用'" />
        </template>
        <template #is_superuser="{ record }">
          <a-tag v-if="record.is_superuser" size="small" color="orangered">超级管理员</a-tag>
          <span v-else class="text-muted">普通用户</span>
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleEdit(record)">
              <template #icon><icon-edit /></template>
            </a-button>
            <a-button type="text" size="small" @click="handleAssignRoles(record)">
              <template #icon><icon-user-group /></template>
            </a-button>
            <a-popconfirm content="确定删除该用户？" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger">
                <template #icon><icon-delete /></template>
              </a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <!-- 新增用户弹窗 -->
    <a-modal
      v-model:visible="createVisible"
      title="新增用户"
      :ok-loading="createLoading"
      @ok="handleCreateSubmit"
    >
      <a-form :model="createForm" :rules="createRules" layout="vertical" ref="createFormRef">
        <a-form-item field="username" label="用户名">
          <a-input v-model="createForm.username" placeholder="请输入用户名" />
        </a-form-item>
        <a-form-item field="email" label="邮箱">
          <a-input v-model="createForm.email" placeholder="请输入邮箱" />
        </a-form-item>
        <a-form-item field="password" label="密码">
          <a-input-password v-model="createForm.password" placeholder="至少6位密码" />
        </a-form-item>
        <a-form-item field="display_name" label="显示名称">
          <a-input v-model="createForm.display_name" placeholder="可选" />
        </a-form-item>
        <a-form-item field="is_superuser" label="超级管理员">
          <a-switch v-model="createForm.is_superuser" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑用户弹窗 -->
    <a-modal
      v-model:visible="editVisible"
      title="编辑用户"
      :ok-loading="editLoading"
      @ok="handleEditSubmit"
    >
      <a-form :model="editForm" layout="vertical" ref="editFormRef">
        <a-form-item field="email" label="邮箱">
          <a-input v-model="editForm.email" placeholder="请输入邮箱" />
        </a-form-item>
        <a-form-item field="display_name" label="显示名称">
          <a-input v-model="editForm.display_name" placeholder="可选" />
        </a-form-item>
        <a-form-item field="is_active" label="状态">
          <a-switch v-model="editForm.is_active" />
        </a-form-item>
        <a-form-item field="is_superuser" label="超级管理员">
          <a-switch v-model="editForm.is_superuser" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 分配角色弹窗 -->
    <a-modal
      v-model:visible="roleVisible"
      title="分配角色"
      :ok-loading="roleLoading"
      @ok="handleRoleSubmit"
    >
      <p class="assign-hint">为 <strong>{{ roleTargetUser?.username }}</strong> 分配角色（全量替换）</p>
      <a-checkbox-group v-model="selectedRoleCodes" direction="vertical">
        <a-checkbox v-for="role in allRoles" :key="role.code" :value="role.code">
          {{ role.name }}
          <span class="role-desc">({{ role.description || role.code }})</span>
        </a-checkbox>
      </a-checkbox-group>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { IUser } from '../../types/user'
import type { IRole } from '../../types/role'
import { getUserList, createUser, updateUser, deleteUser, assignUserRoles } from '../../api/user'
import { getRoleList } from '../../api/role'
import { IconPlus, IconEdit, IconDelete, IconUserGroup } from '@arco-design/web-vue/es/icon'

const loading = ref(false)
const keyword = ref('')
const tableData = ref<IUser[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '用户名', dataIndex: 'username', width: 130 },
  { title: '邮箱', dataIndex: 'email', width: 200 },
  { title: '显示名', dataIndex: 'display_name', width: 120 },
  { title: '状态', slotName: 'is_active', width: 80 },
  { title: '类型', slotName: 'is_superuser', width: 110 },
  { title: '角色', slotName: 'roles', width: 200 },
  { title: '操作', slotName: 'actions', width: 130, fixed: 'right' },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await getUserList({ page: pagination.current, page_size: pagination.pageSize, keyword: keyword.value || undefined })
    tableData.value = res.data.items
    pagination.total = res.data.pagination.total
  } finally {
    loading.value = false
  }
}

function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }

// --- 新增 ---
const createVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref()
const createForm = reactive({ username: '', email: '', password: '', display_name: '', is_superuser: false })
const createRules = {
  username: [{ required: true, message: '请输入用户名' }],
  email: [{ required: true, message: '请输入邮箱' }],
  password: [{ required: true, message: '请输入密码' }, { minLength: 6, message: '至少6位' }],
}

function handleCreate() {
  Object.assign(createForm, { username: '', email: '', password: '', display_name: '', is_superuser: false })
  createVisible.value = true
}

async function handleCreateSubmit() {
  const errors = await createFormRef.value?.validate()
  if (errors) return
  createLoading.value = true
  try {
    await createUser(createForm)
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
const editForm = reactive({ email: '', display_name: '', is_active: true, is_superuser: false })

function handleEdit(record: IUser) {
  editingId.value = record.id
  Object.assign(editForm, { email: record.email, display_name: record.display_name || '', is_active: record.is_active, is_superuser: record.is_superuser })
  editVisible.value = true
}

async function handleEditSubmit() {
  editLoading.value = true
  try {
    await updateUser(editingId.value, editForm)
    Message.success('更新成功')
    editVisible.value = false
    fetchData()
  } finally { editLoading.value = false }
}

// --- 删除 ---
async function handleDelete(id: number) {
  await deleteUser(id)
  Message.success('删除成功')
  fetchData()
}

// --- 分配角色 ---
const roleVisible = ref(false)
const roleLoading = ref(false)
const roleTargetUser = ref<IUser | null>(null)
const selectedRoleCodes = ref<string[]>([])
const allRoles = ref<IRole[]>([])

async function handleAssignRoles(record: IUser) {
  roleTargetUser.value = record
  selectedRoleCodes.value = record.roles.map((r) => r.code)
  // 加载角色列表
  const res = await getRoleList()
  allRoles.value = res.data
  roleVisible.value = true
}

async function handleRoleSubmit() {
  if (!roleTargetUser.value) return
  roleLoading.value = true
  try {
    await assignUserRoles(roleTargetUser.value.id, { role_codes: selectedRoleCodes.value })
    Message.success('角色分配成功')
    roleVisible.value = false
    fetchData()
  } finally { roleLoading.value = false }
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.user-list {
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

.text-muted {
  color: $text-disabled;
  font-size: $font-size-sm;
}

.assign-hint {
  color: $text-secondary;
  margin-bottom: $spacing-md;

  strong { color: $color-primary; }
}

.role-desc {
  color: $text-disabled;
  font-size: $font-size-xs;
  margin-left: 4px;
}
</style>
