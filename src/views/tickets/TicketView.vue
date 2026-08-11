<template>
  <div class="ticket-view">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">工单系统</span>
        <a-space wrap>
          <a-input-search v-model="filters.keyword" placeholder="搜索标题/单号" allow-clear style="width: 200px" @search="handleSearch" @clear="handleSearch" />
          <a-select v-model="filters.status" placeholder="状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-option v-for="(m, k) in statusMap" :key="k" :value="k">{{ m.text }}</a-option>
          </a-select>
          <a-select v-model="filters.ticket_type" placeholder="类型" allow-clear style="width: 120px" @change="handleSearch">
            <a-option v-for="(t, k) in typeMap" :key="k" :value="k">{{ t }}</a-option>
          </a-select>
          <a-select v-model="filters.priority" placeholder="优先级" allow-clear style="width: 120px" @change="handleSearch">
            <a-option v-for="(m, k) in priorityMap" :key="k" :value="k">{{ m.text }}</a-option>
          </a-select>
          <a-button type="primary" @click="handleAdd">
            <template #icon><icon-plus /></template>新建工单
          </a-button>
        </a-space>
      </div>

      <a-table
        :data="tickets"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #ticket_no="{ record }"><span class="mono-text">{{ record.ticket_no }}</span></template>
        <template #title="{ record }"><a-link @click="openDetail(record.id)">{{ record.title }}</a-link></template>
        <template #ticket_type="{ record }"><a-tag size="small">{{ typeMap[record.ticket_type] || record.ticket_type }}</a-tag></template>
        <template #priority="{ record }">
          <a-tag size="small" :color="priorityMap[record.priority]?.color || 'gray'">{{ priorityMap[record.priority]?.text || record.priority }}</a-tag>
        </template>
        <template #status="{ record }">
          <a-tag size="small" :color="statusMap[record.status]?.color || 'gray'">{{ statusMap[record.status]?.text || record.status }}</a-tag>
        </template>
        <template #assignee_name="{ record }">{{ record.assignee_name || '-' }}</template>
        <template #created_at="{ record }">{{ formatTime(record.created_at) }}</template>
        <template #actions="{ record }">
          <a-button type="text" size="small" @click="openDetail(record.id)">详情</a-button>
        </template>
        <template #empty>
          <a-empty description="暂无工单，点击右上角新建" />
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑弹窗 -->
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑工单' : '新建工单'" :width="560" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-form-item field="title" label="标题">
          <a-input v-model="formData.title" placeholder="简要描述问题或需求" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item field="ticket_type" label="类型">
              <a-select v-model="formData.ticket_type" :disabled="!!editingId">
                <a-option v-for="(t, k) in typeMap" :key="k" :value="k">{{ t }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item field="priority" label="优先级">
              <a-select v-model="formData.priority">
                <a-option v-for="(m, k) in priorityMap" :key="k" :value="k">{{ m.text }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item field="assignee_id" label="处理人">
              <a-select v-model="formData.assignee_id" placeholder="可选" allow-clear show-search :filter-option="filterUserOption">
                <a-option v-for="u in users" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="!editingId" field="related_resource_id" label="关联资源 ID">
          <a-input-number v-model="formData.related_resource_id" placeholder="可选，CMDB 资源 ID" style="width: 100%" :min="1" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-textarea v-model="formData.description" placeholder="可选，补充背景与期望" :auto-size="{ minRows: 3, maxRows: 6 }" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 详情抽屉 -->
    <a-drawer v-model:visible="detailVisible" :width="640" :footer="false" unmount-on-close>
      <template #title>
        <span v-if="detail" class="mono-text">{{ detail.ticket_no }}</span>
        <a-tag v-if="detail" size="small" :color="statusMap[detail.status]?.color || 'gray'" style="margin-left: 8px">
          {{ statusMap[detail.status]?.text || detail.status }}
        </a-tag>
      </template>

      <div v-if="detail" class="detail-body">
        <h3 class="detail-title">{{ detail.title }}</h3>
        <a-descriptions :column="2" size="small" class="detail-desc">
          <a-descriptions-item label="类型">{{ typeMap[detail.ticket_type] || detail.ticket_type }}</a-descriptions-item>
          <a-descriptions-item label="优先级">
            <a-tag size="small" :color="priorityMap[detail.priority]?.color || 'gray'">{{ priorityMap[detail.priority]?.text || detail.priority }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detail.creator_name || `#${detail.creator_id}` }}</a-descriptions-item>
          <a-descriptions-item label="处理人">{{ detail.assignee_name || '未指派' }}</a-descriptions-item>
          <a-descriptions-item label="关联资源">
            <a-link v-if="detail.related_resource_id" @click="$router.push({ name: 'ResourceDetail', params: { id: String(detail.related_resource_id) } })">
              #{{ detail.related_resource_id }}
            </a-link>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ formatTime(detail.created_at) }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.resolved_at" label="解决时间">{{ formatTime(detail.resolved_at) }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.closed_at" label="关闭时间">{{ formatTime(detail.closed_at) }}</a-descriptions-item>
          <a-descriptions-item label="描述" :span="2">{{ detail.description || '-' }}</a-descriptions-item>
        </a-descriptions>

        <!-- 操作区 -->
        <a-space wrap class="action-bar">
          <a-button
            v-for="act in statusActions"
            :key="act.target"
            :status="act.danger ? 'danger' : undefined"
            :type="act.primary ? 'primary' : 'outline'"
            size="small"
            @click="openStatusModal(act.target, act.label)"
          >{{ act.label }}</a-button>
          <a-button size="small" @click="openAssignModal">
            <template #icon><icon-user /></template>{{ detail.assignee_id ? '转派' : '指派' }}
          </a-button>
          <a-button v-if="detail.status === 'open'" size="small" @click="handleEdit">
            <template #icon><icon-edit /></template>编辑
          </a-button>
          <a-popconfirm v-if="detail.status === 'open'" content="确定删除该工单？" @ok="handleDelete">
            <a-button size="small" status="danger"><template #icon><icon-delete /></template>删除</a-button>
          </a-popconfirm>
        </a-space>

        <!-- 流转记录 -->
        <div class="section-title">流转记录</div>
        <a-timeline class="timeline">
          <a-timeline-item v-for="c in detail.comments" :key="c.id">
            <div class="comment-line">
              <span class="comment-user">{{ c.user_name || `#${c.user_id}` }}</span>
              <span class="comment-action">{{ actionText(c) }}</span>
              <span class="comment-time">{{ formatTime(c.created_at) }}</span>
            </div>
            <div v-if="c.content" class="comment-content">{{ c.content }}</div>
          </a-timeline-item>
        </a-timeline>

        <!-- 评论输入 -->
        <div v-if="!isTerminal" class="comment-input">
          <a-textarea v-model="commentText" placeholder="添加评论…" :auto-size="{ minRows: 2, maxRows: 4 }" />
          <a-button type="primary" size="small" :loading="commentLoading" :disabled="!commentText.trim()" @click="handleComment">
            提交评论
          </a-button>
        </div>
      </div>
    </a-drawer>

    <!-- 指派弹窗 -->
    <a-modal v-model:visible="assignVisible" title="指派处理人" :width="420" :ok-loading="assignLoading" @ok="handleAssign">
      <a-select v-model="assigneeId" placeholder="请选择处理人" allow-clear show-search :filter-option="filterUserOption" style="width: 100%">
        <a-option v-for="u in users" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
      </a-select>
    </a-modal>

    <!-- 状态流转弹窗 -->
    <a-modal v-model:visible="statusModalVisible" :title="statusModalLabel" :width="420" :ok-loading="statusLoading" @ok="handleStatusChange">
      <a-textarea v-model="statusComment" placeholder="流转备注（可选）" :auto-size="{ minRows: 2, maxRows: 4 }" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconUser } from '@arco-design/web-vue/es/icon'
import * as ticketApi from '../../api/ticket'
import type { ITicket, ITicketDetail, ITicketComment } from '../../api/ticket'
import { getUserList } from '../../api/user'
import type { IUser } from '../../types/user'

// ========== 字典 ==========
const statusMap: Record<string, { text: string; color: string }> = {
  open: { text: '待处理', color: 'blue' },
  in_progress: { text: '处理中', color: 'orange' },
  resolved: { text: '已解决', color: 'green' },
  closed: { text: '已关闭', color: 'gray' },
  cancelled: { text: '已取消', color: 'red' },
}
const typeMap: Record<string, string> = { general: '通用', request: '申请', change: '变更', incident: '故障' }
const priorityMap: Record<string, { text: string; color: string }> = {
  low: { text: '低', color: 'gray' },
  medium: { text: '中', color: 'blue' },
  high: { text: '高', color: 'orange' },
  urgent: { text: '紧急', color: 'red' },
}
// 与后端 STATUS_TRANSITIONS 保持一致
const STATUS_ACTIONS: Record<string, Array<{ target: string; label: string; danger?: boolean; primary?: boolean }>> = {
  open: [
    { target: 'in_progress', label: '开始处理', primary: true },
    { target: 'cancelled', label: '取消工单', danger: true },
  ],
  in_progress: [
    { target: 'resolved', label: '标记解决', primary: true },
    { target: 'cancelled', label: '取消工单', danger: true },
  ],
  resolved: [
    { target: 'closed', label: '关闭工单', primary: true },
    { target: 'in_progress', label: '重新打开' },
  ],
}

function formatTime(t: string | null) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ========== 列表 ==========
const loading = ref(false)
const tickets = ref<ITicket[]>([])
const filters = reactive({ keyword: '', status: undefined as string | undefined, ticket_type: undefined as string | undefined, priority: undefined as string | undefined })
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '单号', slotName: 'ticket_no', width: 130 },
  { title: '标题', slotName: 'title', ellipsis: true },
  { title: '类型', slotName: 'ticket_type', width: 80 },
  { title: '优先级', slotName: 'priority', width: 80 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '处理人', slotName: 'assignee_name', width: 100 },
  { title: '创建时间', slotName: 'created_at', width: 150 },
  { title: '操作', slotName: 'actions', width: 70 },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await ticketApi.getTickets({
      keyword: filters.keyword || undefined,
      status: filters.status,
      ticket_type: filters.ticket_type,
      priority: filters.priority,
      page: pagination.current,
      page_size: pagination.pageSize,
    })
    tickets.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取工单列表失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }

// ========== 用户（处理人候选） ==========
const users = ref<IUser[]>([])
async function fetchUsers() {
  try { const res = await getUserList({ page: 1, page_size: 100 }); users.value = res.data.items } catch { /* ignore */ }
}
function filterUserOption(input: string, option: { label?: string; value?: unknown }) {
  const u = users.value.find(x => x.id === option.value)
  if (!u) return false
  const label = `${u.display_name || ''} ${u.username}`.toLowerCase()
  return label.includes(input.toLowerCase())
}

// ========== 新建/编辑 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const formData = reactive({
  title: '', ticket_type: 'general', priority: 'medium',
  assignee_id: undefined as number | undefined, related_resource_id: undefined as number | undefined,
  description: '',
})
const formRules = { title: [{ required: true, message: '请输入标题' }] }

function handleAdd() {
  editingId.value = null
  Object.assign(formData, { title: '', ticket_type: 'general', priority: 'medium', assignee_id: undefined, related_resource_id: undefined, description: '' })
  formVisible.value = true
}

function handleEdit() {
  if (!detail.value) return
  editingId.value = detail.value.id
  Object.assign(formData, {
    title: detail.value.title, ticket_type: detail.value.ticket_type, priority: detail.value.priority,
    assignee_id: detail.value.assignee_id ?? undefined, related_resource_id: undefined,
    description: detail.value.description || '',
  })
  formVisible.value = true
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  formLoading.value = true
  try {
    if (editingId.value) {
      await ticketApi.updateTicket(editingId.value, {
        title: formData.title, priority: formData.priority, description: formData.description || null,
      })
    } else {
      await ticketApi.createTicket({
        title: formData.title, ticket_type: formData.ticket_type, priority: formData.priority,
        assignee_id: formData.assignee_id ?? null, related_resource_id: formData.related_resource_id ?? null,
        description: formData.description || null,
      })
    }
    Message.success(editingId.value ? '编辑成功' : '创建成功')
    formVisible.value = false
    fetchData()
    if (detailVisible.value && editingId.value) openDetail(editingId.value)
  } catch { Message.error('操作失败') } finally { formLoading.value = false }
}

// ========== 详情 ==========
const detailVisible = ref(false)
const detail = ref<ITicketDetail | null>(null)

async function openDetail(id: number) {
  detailVisible.value = true
  try { detail.value = (await ticketApi.getTicket(id)).data } catch { Message.error('获取工单详情失败'); detailVisible.value = false }
}

const isTerminal = computed(() => detail.value ? ['closed', 'cancelled'].includes(detail.value.status) : true)
const statusActions = computed(() => (detail.value ? STATUS_ACTIONS[detail.value.status] || [] : []))

function actionText(c: ITicketComment) {
  if (c.action === 'status_change' && c.from_value && c.to_value) {
    return `将状态从「${statusMap[c.from_value]?.text || c.from_value}」流转为「${statusMap[c.to_value]?.text || c.to_value}」`
  }
  if (c.action === 'comment') return '添加了评论'
  if (c.action === 'create') return '创建了工单'
  if (c.action === 'assign') return '指派了处理人'
  if (c.action === 'update') return '更新了工单'
  return c.action
}

async function handleDelete() {
  if (!detail.value) return
  try {
    await ticketApi.deleteTicket(detail.value.id)
    Message.success('删除成功')
    detailVisible.value = false
    fetchData()
  } catch { Message.error('删除失败') }
}

// ========== 指派 ==========
const assignVisible = ref(false)
const assignLoading = ref(false)
const assigneeId = ref<number | undefined>(undefined)

function openAssignModal() {
  assigneeId.value = detail.value?.assignee_id ?? undefined
  assignVisible.value = true
}

async function handleAssign() {
  if (!assigneeId.value || !detail.value) { Message.warning('请选择处理人'); return }
  assignLoading.value = true
  try {
    await ticketApi.assignTicket(detail.value.id, assigneeId.value)
    Message.success('指派成功')
    assignVisible.value = false
    openDetail(detail.value.id)
    fetchData()
  } catch { Message.error('指派失败') } finally { assignLoading.value = false }
}

// ========== 状态流转 ==========
const statusModalVisible = ref(false)
const statusModalLabel = ref('')
const statusTarget = ref('')
const statusComment = ref('')
const statusLoading = ref(false)

function openStatusModal(target: string, label: string) {
  statusTarget.value = target
  statusModalLabel.value = label
  statusComment.value = ''
  statusModalVisible.value = true
}

async function handleStatusChange() {
  if (!detail.value) return
  statusLoading.value = true
  try {
    await ticketApi.changeTicketStatus(detail.value.id, statusTarget.value, statusComment.value || null)
    Message.success('状态已更新')
    statusModalVisible.value = false
    openDetail(detail.value.id)
    fetchData()
  } catch { Message.error('状态流转失败') } finally { statusLoading.value = false }
}

// ========== 评论 ==========
const commentText = ref('')
const commentLoading = ref(false)

async function handleComment() {
  if (!detail.value || !commentText.value.trim()) return
  commentLoading.value = true
  try {
    await ticketApi.addTicketComment(detail.value.id, commentText.value.trim())
    commentText.value = ''
    openDetail(detail.value.id)
  } catch { Message.error('评论失败') } finally { commentLoading.value = false }
}

onMounted(() => { fetchData(); fetchUsers() })
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.ticket-view { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; flex-wrap: wrap; gap: $spacing-sm; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.mono-text { font-family: $font-mono; font-size: $font-size-sm; }

.detail-body { display: flex; flex-direction: column; gap: $spacing-md; }
.detail-title { margin: 0; font-size: $font-size-lg; color: $text-primary; }
.detail-desc { :deep(.arco-descriptions-item-value) { color: $text-secondary; } }
.action-bar { padding: $spacing-sm 0; border-top: 1px solid $border-color-light; border-bottom: 1px solid $border-color-light; }
.section-title { font-size: $font-size-base; font-weight: 600; color: $text-primary; }

.timeline {
  .comment-line { display: flex; align-items: baseline; gap: $spacing-sm; flex-wrap: wrap; }
  .comment-user { font-weight: 600; color: $text-primary; }
  .comment-action { color: $text-secondary; }
  .comment-time { color: $text-tertiary; font-size: $font-size-sm; }
  .comment-content { margin-top: 4px; color: $text-secondary; white-space: pre-wrap; }
}

.comment-input { display: flex; flex-direction: column; gap: $spacing-sm; align-items: flex-end; }
</style>
