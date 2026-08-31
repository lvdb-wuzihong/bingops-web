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
          <a-select v-model="filters.group_id" placeholder="处理组" allow-clear style="width: 140px" @change="handleSearch">
            <a-option v-for="g in groupOptions" :key="g.id" :value="g.id">{{ g.name }}</a-option>
          </a-select>
          <a-select v-model="filters.catalog_item_id" placeholder="服务目录" allow-clear show-search style="width: 180px" @change="handleSearch">
            <a-option v-for="c in catalogLeafOptions" :key="c.id" :value="c.id">{{ c.label }}</a-option>
          </a-select>
          <a-select
            v-model="filters.target_resource_id"
            placeholder="目标资源"
            allow-clear
            allow-search
            :filter-option="false"
            :loading="filterResSearching"
            style="width: 180px"
            @search="searchFilterResources"
            @change="handleSearch"
          >
            <a-option v-for="r in filterResourceOptions" :key="r.id" :value="r.id">{{ r.name }}（{{ r.model_code || '-' }}）</a-option>
          </a-select>
          <a-button @click="openFreezeDrawer">
            <template #icon><icon-safe /></template>封禁窗口
          </a-button>
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
        <template #catalog="{ record }">
          <span v-if="record.catalog_item_name">{{ record.catalog_category_name ? `${record.catalog_category_name} / ` : '' }}{{ record.catalog_item_name }}</span>
          <span v-else>-</span>
        </template>
        <template #group_name="{ record }">{{ record.group_name || '-' }}</template>
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
    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑工单' : '新建工单'" :width="620" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-form-item field="title" label="标题">
          <a-input v-model="formData.title" placeholder="简要描述问题或需求" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item field="ticket_type" label="类型">
              <a-select v-model="formData.ticket_type" :disabled="!!editingId">
                <a-option v-for="(t, k) in typeMap" :key="k" :value="k">{{ t }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item field="priority" label="优先级">
              <a-select v-model="formData.priority">
                <a-option v-for="(m, k) in priorityMap" :key="k" :value="k">{{ m.text }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="!editingId" field="target_resource_ids" :label="targetRequired ? '执行目标（关联 Runbook 必填）' : '执行目标'">
          <a-select
            v-model="formData.target_resource_ids"
            placeholder="输入名称/实例 ID 搜索资源，可多选"
            allow-clear
            allow-search
            multiple
            :filter-option="false"
            :loading="targetSearching"
            @search="searchTargetResources"
          >
            <a-option v-for="r in targetResourceOptions" :key="r.id" :value="r.id">
              {{ r.name }}（{{ r.model_code || '-' }} / {{ r.region || '-' }}）
            </a-option>
          </a-select>
        </a-form-item>
        <template v-if="!editingId">
          <a-form-item field="catalog_item_id" label="服务目录事项">
            <a-select v-model="formData.catalog_item_id" placeholder="按当前类型过滤，选择后快照难度/默认 Runbook" allow-clear show-search>
              <a-option v-for="c in formCatalogOptions" :key="c.id" :value="c.id">{{ c.label }}</a-option>
            </a-select>
          </a-form-item>
          <p class="form-hint">处理组按目录默认配置自动派生（事项优先于分类）；处理人按当日值班 tier1 → 组成员轮转自动分派，创建后可在详情人工改派</p>
        </template>

        <!-- 变更工单：变更上下文检查（runbook 由目录配置自动携带，运维建单后下发） -->
        <template v-if="!editingId && formData.ticket_type === 'change'">
          <p class="form-hint">所选目录事项配置了默认 Runbook 时将自动携带（中高危走审批）；建单后由运维补 git tag 下发执行，提单人无需接触</p>
          <div v-if="changeContext.length" class="ctx-panel">
            <div class="ctx-title">变更上下文检查</div>
            <div v-for="r in changeContext" :key="r.resource_id" class="ctx-item">
              <span class="ctx-name">{{ r.name || `#${r.resource_id}` }}</span>
              <a-tag v-if="r.env" size="small">{{ r.env }}</a-tag>
              <a-tag v-if="r.busy_execution_id" size="small" color="orange">任务占用 #{{ r.busy_execution_id }}</a-tag>
              <a-tag v-for="t in r.active_tickets" :key="t.id" size="small" color="gold">活跃工单 {{ t.ticket_no }}</a-tag>
              <a-tag v-for="f in r.active_freezes" :key="f.id" size="small" color="red">封禁：{{ f.name }}</a-tag>
              <span v-if="r.recent_changes.length" class="ctx-text">近期变更 {{ r.recent_changes.length }} 条</span>
            </div>
          </div>
        </template>

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
        <a-tag v-if="detail?.approval_status === 'pending'" size="small" color="gold" style="margin-left: 8px">待审批</a-tag>
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
          <a-descriptions-item label="执行目标" :span="2">
            <a-space v-if="detail.target_resource_ids.length" wrap>
              <a-link v-for="rid in detail.target_resource_ids" :key="rid" @click="$router.push({ name: 'ResourceDetail', params: { id: String(rid) } })">
                {{ targetResourceNames.get(rid) || `#${rid}` }}
              </a-link>
            </a-space>
            <span v-else-if="detail.related_resource_id">#{{ detail.related_resource_id }}</span>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="服务目录">
            <span v-if="detail.catalog_item_name">{{ detail.catalog_category_name ? `${detail.catalog_category_name} / ` : '' }}{{ detail.catalog_item_name }}</span>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="处理组">{{ detail.group_name || '-' }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.difficulty" label="难度">
            <a-tag size="small" :color="DIFFICULTY_MAP[detail.difficulty]?.color || 'gray'">{{ DIFFICULTY_MAP[detail.difficulty]?.text || detail.difficulty }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item v-if="detail.started_at" label="开始时间">{{ formatTime(detail.started_at) }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ formatTime(detail.created_at) }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.runbook_id" label="Runbook">#{{ detail.runbook_id }}（{{ detail.code_ref || '未指定版本' }}）</a-descriptions-item>
          <a-descriptions-item v-if="detail.resolved_at" label="解决时间">{{ formatTime(detail.resolved_at) }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.closed_at" label="关闭时间">{{ formatTime(detail.closed_at) }}</a-descriptions-item>
          <a-descriptions-item label="描述" :span="2">{{ detail.description || '-' }}</a-descriptions-item>
        </a-descriptions>

        <!-- 审批操作 -->
        <div v-if="detail.approval_status === 'pending'" class="approval-bar">
          <span class="approval-hint">变更工单待审批（创建人不可审批自己的工单）</span>
          <a-space>
            <a-button type="primary" size="small" status="success" @click="openApprovalModal('approve')">通过</a-button>
            <a-button size="small" status="danger" @click="openApprovalModal('reject')">拒绝</a-button>
          </a-space>
        </div>

        <!-- 关联任务执行 -->
        <div v-if="detail.job_execution" class="job-bar">
          <span class="section-title">关联任务</span>
          <a-link @click="$router.push({ name: 'JobExecutionDetail', params: { id: String(detail.job_execution.id) } })">
            #{{ detail.job_execution.id }}
          </a-link>
          <a-tag size="small" :color="executionStatus(detail.job_execution.status).color">
            {{ executionStatus(detail.job_execution.status).text }}
          </a-tag>
        </div>

        <!-- 操作区 -->
        <a-space wrap class="action-bar">
          <a-button v-if="canDispatch" size="small" type="primary" @click="openDispatchModal">
            <template #icon><icon-thunderbolt /></template>下发执行
          </a-button>
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

        <!-- 审批记录 -->
        <template v-if="detail.approvals.length">
          <div class="section-title">审批记录</div>
          <a-timeline class="timeline">
            <a-timeline-item v-for="a in detail.approvals" :key="a.id">
              <div class="comment-line">
                <span class="comment-user">{{ a.approver_name || `#${a.approver_id}` }}</span>
                <a-tag size="small" :color="a.action === 'approve' ? 'green' : 'red'">{{ a.action === 'approve' ? '通过' : '拒绝' }}</a-tag>
                <span class="comment-time">{{ formatTime(a.created_at) }}</span>
              </div>
              <div v-if="a.comment" class="comment-content">{{ a.comment }}</div>
            </a-timeline-item>
          </a-timeline>
        </template>

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

    <!-- 指派/转派弹窗（人工改派场景，候选 = 组成员 ∪ 当日值班） -->
    <a-modal v-model:visible="assignVisible" title="指派处理人" :width="420" :ok-loading="assignLoading" @ok="handleAssign">
      <p v-if="assignCandidates" class="form-hint">候选人 = 该组成员 + 当日值班（{{ assignCandidates.length }} 人）</p>
      <a-select v-model="assigneeId" placeholder="请选择处理人" allow-clear allow-search style="width: 100%">
        <a-option v-for="o in assignOptions" :key="o.id" :value="o.id">{{ o.label }}</a-option>
      </a-select>
    </a-modal>

    <!-- 状态流转弹窗 -->
    <a-modal v-model:visible="statusModalVisible" :title="statusModalLabel" :width="420" :ok-loading="statusLoading" @ok="handleStatusChange">
      <a-textarea v-model="statusComment" placeholder="流转备注（可选）" :auto-size="{ minRows: 2, maxRows: 4 }" />
    </a-modal>

    <!-- 审批弹窗 -->
    <a-modal v-model:visible="approvalVisible" :title="approvalAction === 'approve' ? '审批通过' : '审批拒绝'" :width="420" :ok-loading="approvalLoading" @ok="handleApproval">
      <a-textarea v-model="approvalComment" placeholder="审批意见（可选）" :auto-size="{ minRows: 2, maxRows: 4 }" />
    </a-modal>

    <!-- 下发弹窗（运维事后补齐执行配置，提单人不接触） -->
    <a-modal v-model:visible="dispatchVisible" title="下发执行" :width="480" :ok-loading="dispatchLoading" @ok="handleDispatch">
      <p class="form-hint">Runbook 来自目录默认配置（#{{ detail?.runbook_id }}）；填写 git tag 后下发 runner，参数按 params_schema 校验</p>
      <a-form :model="dispatchForm" layout="vertical">
        <a-form-item label="代码版本（git tag）" required>
          <a-input v-model="dispatchForm.code_ref" placeholder="如：v1.0.0" />
        </a-form-item>
        <a-form-item label="执行参数（JSON，可选）">
          <a-textarea v-model="dispatchForm.paramsText" placeholder='{"key": "value"}' :auto-size="{ minRows: 2, maxRows: 5 }" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 封禁窗口抽屉 -->
    <a-drawer v-model:visible="freezeVisible" title="变更封禁窗口" :width="620" unmount-on-close>
      <div class="freeze-head">
        <a-button type="primary" size="small" @click="freezeFormVisible = !freezeFormVisible">
          <template #icon><icon-plus /></template>新建封禁
        </a-button>
      </div>
      <a-form v-if="freezeFormVisible" :model="freezeForm" layout="vertical" class="freeze-form">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="名称"><a-input v-model="freezeForm.name" placeholder="如：双十一封网" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="原因"><a-input v-model="freezeForm.reason" placeholder="可选" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="限定模型（留空为全局封禁）">
          <a-input-tag v-model="freezeForm.scope" placeholder="模型 code，如 aliyun_ecs" allow-clear />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="开始时间"><a-date-picker v-model="freezeForm.starts_at" show-time value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间"><a-date-picker v-model="freezeForm.ends_at" show-time value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" /></a-form-item>
          </a-col>
        </a-row>
        <a-button type="primary" size="small" :loading="freezeCreating" @click="handleCreateFreeze">创建</a-button>
      </a-form>
      <a-table :data="freezes" :loading="freezeLoading" :columns="freezeColumns" :pagination="false" size="small" row-key="id" style="margin-top: 12px">
        <template #scope="{ record }">
          <a-space wrap size="mini" v-if="(record.scope || []).length">
            <a-tag v-for="s in record.scope" :key="s" size="small">{{ s }}</a-tag>
          </a-space>
          <a-tag v-else size="small" color="red">全局</a-tag>
        </template>
        <template #window="{ record }">{{ formatTime(record.starts_at) }} ~ {{ formatTime(record.ends_at) }}</template>
        <template #freeze_actions="{ record }">
          <a-popconfirm content="确定删除该封禁窗口？" @ok="handleDeleteFreeze(record.id)">
            <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
          </a-popconfirm>
        </template>
      </a-table>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete, IconUser, IconSafe, IconThunderbolt } from '@arco-design/web-vue/es/icon'
import * as ticketApi from '../../api/ticket'
import type { ITicket, ITicketDetail, ITicketComment, IFreeze, IChangeContextResource } from '../../api/ticket'
import * as metaApi from '../../api/ticketMeta'
import { DIFFICULTY_MAP } from '../../api/ticketMeta'
import type { ICatalogItem, ITicketGroup, IAssigneeCandidate } from '../../api/ticketMeta'
import { executionStatus } from '../../api/job'
import { getResourceOptions, getResourceDetail } from '../../api/cmdb'
import type { IResourceOption } from '../../api/cmdb'
import { getUserList } from '../../api/user'
import type { IUser } from '../../types/user'
import { useUserStore } from '../../stores/user'

// ========== 字典 ==========
const statusMap: Record<string, { text: string; color: string }> = {
  pending_approval: { text: '待审批', color: 'gold' },
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
// 与后端 STATUS_TRANSITIONS 保持一致（pending_approval 仅允许取消，审批走专用端点）
const STATUS_ACTIONS: Record<string, Array<{ target: string; label: string; danger?: boolean; primary?: boolean }>> = {
  pending_approval: [
    { target: 'cancelled', label: '取消工单', danger: true },
  ],
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
const filters = reactive({ keyword: '', status: undefined as string | undefined, ticket_type: undefined as string | undefined, priority: undefined as string | undefined, group_id: undefined as number | undefined, catalog_item_id: undefined as number | undefined, target_resource_id: undefined as number | undefined })
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })

const columns = [
  { title: '单号', slotName: 'ticket_no', width: 130 },
  { title: '标题', slotName: 'title', ellipsis: true },
  { title: '类型', slotName: 'ticket_type', width: 80 },
  { title: '优先级', slotName: 'priority', width: 80 },
  { title: '状态', slotName: 'status', width: 90 },
  { title: '目录', slotName: 'catalog', width: 150, ellipsis: true },
  { title: '处理组', slotName: 'group_name', width: 100 },
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
      group_id: filters.group_id,
      catalog_item_id: filters.catalog_item_id,
      target_resource_id: filters.target_resource_id,
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

// ========== 用户（改派候选回退用） ==========
const users = ref<IUser[]>([])
async function fetchUsers() {
  try { const res = await getUserList({ page: 1, page_size: 100 }); users.value = res.data.items } catch { /* ignore */ }
}

// ========== 新建/编辑 ==========
const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const changeContext = ref<IChangeContextResource[]>([])
const groupOptions = ref<ITicketGroup[]>([])
const catalogItems = ref<ICatalogItem[]>([])
const catalogLeafOptions = computed(() => {
  const cats = new Map(catalogItems.value.filter(i => i.parent_id === null).map(i => [i.id, i.name]))
  return catalogItems.value
    .filter(i => i.parent_id !== null && i.is_active)
    .map(i => ({ id: i.id, label: `${cats.get(i.parent_id as number) || ''} / ${i.name}` }))
})

async function fetchMetaOptions() {
  try { groupOptions.value = (await metaApi.getGroups()).data } catch { /* ignore */ }
  try { catalogItems.value = (await metaApi.getCatalog()).data } catch { /* ignore */ }
}

// 执行目标选择器（轻量搜索接口，多选）
const targetResourceOptions = ref<IResourceOption[]>([])
const targetSearching = ref(false)

async function searchTargetResources(keyword: string) {
  targetSearching.value = true
  try {
    const res = await getResourceOptions({ keyword: keyword || undefined, limit: 20 })
    // 保留已选项避免回显丢失
    const merged = [...res.data]
    for (const r of targetResourceOptions.value) {
      if (formData.target_resource_ids.includes(r.id) && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    targetResourceOptions.value = merged
  } catch { /* ignore */ } finally { targetSearching.value = false }
}

// 筛选栏目标资源过滤选择器
const filterResourceOptions = ref<IResourceOption[]>([])
const filterResSearching = ref(false)

async function searchFilterResources(keyword: string) {
  filterResSearching.value = true
  try {
    const res = await getResourceOptions({ keyword: keyword || undefined, limit: 20 })
    const merged = [...res.data]
    for (const r of filterResourceOptions.value) {
      if (filters.target_resource_id === r.id && !merged.some(m => m.id === r.id)) merged.push(r)
    }
    filterResourceOptions.value = merged
  } catch { /* ignore */ } finally { filterResSearching.value = false }
}

const formData = reactive({
  title: '', ticket_type: 'general', priority: 'medium',
  target_resource_ids: [] as number[],
  catalog_item_id: undefined as number | undefined,
  description: '',
})

// 选择目录事项后预填默认类型（runbook 由后端从目录 default_runbook_id 携带，不在表单出现）
watch(() => formData.catalog_item_id, (cid) => {
  if (!cid) return
  const item = catalogItems.value.find(i => i.id === cid)
  if (!item) return
  formData.ticket_type = item.default_type
})

// 表单目录选项：仅默认类型与当前工单类型匹配的事项，避免跨类型误选
const formCatalogOptions = computed(() => {
  const cats = new Map(catalogItems.value.filter(i => i.parent_id === null).map(i => [i.id, i.name]))
  return catalogItems.value
    .filter(i => i.parent_id !== null && i.is_active && i.default_type === formData.ticket_type)
    .map(i => ({ id: i.id, label: `${cats.get(i.parent_id as number) || ''} / ${i.name}` }))
})

// 切换类型时清空已选的不匹配事项
watch(() => formData.ticket_type, (t) => {
  if (!formData.catalog_item_id) return
  const item = catalogItems.value.find(i => i.id === formData.catalog_item_id)
  if (item && item.default_type !== t) formData.catalog_item_id = undefined
})
const formRules = computed(() => ({
  title: [{ required: true, message: '请输入标题' }],
  target_resource_ids: targetRequired.value
    ? [{ required: true, message: '工单关联了 Runbook，必须选择执行目标' }]
    : [],
}))

// 条件必填：目录事项绑了 runbook 时目标必填（与后端 _validate_runbook_intent 同规则）
const targetRequired = computed(() => {
  if (formData.catalog_item_id) {
    const item = catalogItems.value.find(i => i.id === formData.catalog_item_id)
    if (item?.default_runbook_id) return true
  }
  return false
})

// 变更工单选定执行目标后拉取变更上下文（封禁/占用/活跃工单/近期变更）
watch(() => formData.target_resource_ids.join(','), async (key) => {
  changeContext.value = []
  if (!key || formData.ticket_type !== 'change') return
  try { changeContext.value = (await ticketApi.getChangeContext([...formData.target_resource_ids])).data } catch { /* ignore */ }
})

function handleAdd() {
  editingId.value = null
  Object.assign(formData, {
    title: '', ticket_type: 'general', priority: 'medium', target_resource_ids: [],
    catalog_item_id: undefined,
    description: '',
  })
  changeContext.value = []
  fetchMetaOptions()
  searchTargetResources('')
  formVisible.value = true
}

function handleEdit() {
  if (!detail.value) return
  editingId.value = detail.value.id
  Object.assign(formData, {
    title: detail.value.title, ticket_type: detail.value.ticket_type, priority: detail.value.priority,
    target_resource_ids: [],
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
        target_resource_ids: formData.target_resource_ids,
        catalog_item_id: formData.catalog_item_id ?? null,
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
  try {
    detail.value = (await ticketApi.getTicket(id)).data
    resolveTargetNames(detail.value.target_resource_ids || [])
  } catch { Message.error('获取工单详情失败'); detailVisible.value = false }
}

// 执行目标名称回显：按 id 批量取 name
const targetResourceNames = ref<Map<number, string>>(new Map())

async function resolveTargetNames(ids: number[]) {
  targetResourceNames.value = new Map()
  if (!ids.length) return
  const entries = await Promise.all(ids.map(async (id): Promise<[number, string]> => {
    try {
      const r = await getResourceDetail(id)
      return [id, r.data.name]
    } catch { return [id, `#${id}`] }
  }))
  targetResourceNames.value = new Map(entries)
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
  if (c.action === 'approve') return '审批通过'
  if (c.action === 'reject') return '审批拒绝'
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

// ========== 指派/转派（人工改派，候选接口仅在此场景使用） ==========
const assignVisible = ref(false)
const assignLoading = ref(false)
const assigneeId = ref<number | undefined>(undefined)
const assignCandidates = ref<IAssigneeCandidate[] | null>(null)

const assignOptions = computed(() => {
  const base = assignCandidates.value
    ? assignCandidates.value.map(c => ({ id: c.id, label: c.display_name || c.username }))
    : users.value.map(u => ({ id: u.id, label: u.display_name || u.username }))
  // 当前处理人不在候选中时保留回显
  if (assigneeId.value && !base.some(o => o.id === assigneeId.value)) {
    const u = users.value.find(x => x.id === assigneeId.value)
    if (u) base.push({ id: u.id, label: u.display_name || u.username })
  }
  return base
})

async function openAssignModal() {
  assigneeId.value = detail.value?.assignee_id ?? undefined
  assignCandidates.value = null
  const gid = detail.value?.group_id
  if (gid) {
    try { assignCandidates.value = (await metaApi.getGroupCandidates(gid)).data } catch { /* ignore */ }
  }
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

// ========== 审批 ==========
const approvalVisible = ref(false)
const approvalAction = ref<'approve' | 'reject'>('approve')
const approvalComment = ref('')
const approvalLoading = ref(false)

function openApprovalModal(action: 'approve' | 'reject') {
  approvalAction.value = action
  approvalComment.value = ''
  approvalVisible.value = true
}

async function handleApproval() {
  if (!detail.value) return
  approvalLoading.value = true
  try {
    await ticketApi.approveTicket(detail.value.id, approvalAction.value, approvalComment.value || null)
    Message.success(approvalAction.value === 'approve' ? '已通过，工单转待处理' : '已拒绝，工单取消')
    approvalVisible.value = false
    openDetail(detail.value.id)
    fetchData()
  } catch { /* 拦截器已提示（如创建人自审） */ } finally { approvalLoading.value = false }
}

// ========== 运维下发（job:create 权限，提单人不接触 runbook） ==========
const userStore = useUserStore()
const dispatchVisible = ref(false)
const dispatchLoading = ref(false)
const dispatchForm = reactive({ code_ref: '', paramsText: '' })

// runbook 由目录配置携带；工单 open 且当前用户有 job:create 时才显示下发入口
const canDispatch = computed(() =>
  !!detail.value?.runbook_id && detail.value.status === 'open' && userStore.hasPermission('job:create'),
)

function openDispatchModal() {
  Object.assign(dispatchForm, { code_ref: detail.value?.code_ref || '', paramsText: '' })
  dispatchVisible.value = true
}

async function handleDispatch() {
  if (!detail.value) return
  if (!dispatchForm.code_ref.trim()) { Message.warning('请输入 git tag'); return }
  let params: Record<string, unknown> = {}
  if (dispatchForm.paramsText.trim()) {
    try { params = JSON.parse(dispatchForm.paramsText) } catch { Message.warning('执行参数不是合法 JSON'); return }
  }
  dispatchLoading.value = true
  try {
    await ticketApi.dispatchTicket(detail.value.id, { code_ref: dispatchForm.code_ref.trim(), params })
    Message.success('已下发执行')
    dispatchVisible.value = false
    openDetail(detail.value.id)
    fetchData()
  } catch { /* 拦截器已提示（无 runbook/非 open/活跃执行/参数不合 schema） */ } finally { dispatchLoading.value = false }
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

// ========== 封禁窗口 ==========
const freezeVisible = ref(false)
const freezeLoading = ref(false)
const freezes = ref<IFreeze[]>([])
const freezeFormVisible = ref(false)
const freezeCreating = ref(false)
const freezeForm = reactive({ name: '', reason: '', scope: [] as string[], starts_at: '', ends_at: '' })

const freezeColumns = [
  { title: '名称', dataIndex: 'name', width: 140, ellipsis: true },
  { title: '范围', slotName: 'scope', width: 140 },
  { title: '时间窗口', slotName: 'window', width: 220 },
  { title: '操作', slotName: 'freeze_actions', width: 60 },
]

async function fetchFreezes() {
  freezeLoading.value = true
  try { freezes.value = (await ticketApi.getFreezes()).data } catch { /* ignore */ } finally { freezeLoading.value = false }
}

function openFreezeDrawer() {
  freezeVisible.value = true
  fetchFreezes()
}

async function handleCreateFreeze() {
  if (!freezeForm.name || !freezeForm.starts_at || !freezeForm.ends_at) { Message.warning('名称与起止时间必填'); return }
  freezeCreating.value = true
  try {
    await ticketApi.createFreeze({
      name: freezeForm.name,
      reason: freezeForm.reason || null,
      scope: freezeForm.scope.length ? freezeForm.scope : null,
      starts_at: new Date(freezeForm.starts_at).toISOString(),
      ends_at: new Date(freezeForm.ends_at).toISOString(),
    })
    Message.success('封禁窗口已创建')
    freezeFormVisible.value = false
    Object.assign(freezeForm, { name: '', reason: '', scope: [], starts_at: '', ends_at: '' })
    fetchFreezes()
  } catch { /* 拦截器已提示 */ } finally { freezeCreating.value = false }
}

async function handleDeleteFreeze(id: number) {
  try { await ticketApi.deleteFreeze(id); Message.success('已删除'); fetchFreezes() } catch { /* 拦截器已提示 */ }
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

.approval-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: $spacing-sm; background: rgba(250, 173, 20, 0.08);
  border: 1px solid rgba(250, 173, 20, 0.35); border-radius: $radius-md;
  .approval-hint { font-size: $font-size-xs; color: $text-secondary; }
}

.job-bar { display: flex; align-items: center; gap: $spacing-sm; }

.ctx-panel {
  margin-bottom: $spacing-md; padding: $spacing-sm;
  background: rgba(22, 119, 255, 0.04); border: 1px solid $border-color-light; border-radius: $radius-md;
  .ctx-title { font-size: $font-size-xs; font-weight: 600; color: $text-secondary; margin-bottom: 4px; }
  .ctx-item { display: flex; align-items: center; gap: $spacing-xs; flex-wrap: wrap; padding: 2px 0; }
  .ctx-name { font-size: $font-size-sm; color: $text-primary; font-weight: 500; }
  .ctx-text { font-size: $font-size-xs; color: $text-secondary; }
}

.timeline {
  .comment-line { display: flex; align-items: baseline; gap: $spacing-sm; flex-wrap: wrap; }
  .comment-user { font-weight: 600; color: $text-primary; }
  .comment-action { color: $text-secondary; }
  .comment-time { color: $text-disabled; font-size: $font-size-sm; }
  .comment-content { margin-top: 4px; color: $text-secondary; white-space: pre-wrap; }
}

.comment-input { display: flex; flex-direction: column; gap: $spacing-sm; align-items: flex-end; }

.form-hint { font-size: $font-size-xs; color: $text-secondary; margin: -8px 0 12px; }

.freeze-head { display: flex; justify-content: flex-end; margin-bottom: $spacing-sm; }
.freeze-form { padding: $spacing-sm; background: rgba(22, 119, 255, 0.04); border: 1px solid $border-color-light; border-radius: $radius-md; margin-bottom: $spacing-sm; }
</style>
