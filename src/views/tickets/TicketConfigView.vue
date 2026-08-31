<template>
  <div class="ticket-config">
    <a-card :bordered="false" class="list-card">
      <a-tabs v-model:active-key="activeTab">
        <!-- ========== 服务目录 ========== -->
        <a-tab-pane key="catalog" title="服务目录">
          <div class="tab-toolbar">
            <a-button type="primary" size="small" @click="openCatalogCreate('category')">
              <template #icon><icon-plus /></template>新增分类
            </a-button>
            <a-button size="small" @click="fetchCatalog">
              <template #icon><icon-refresh /></template>
            </a-button>
          </div>
          <a-spin :loading="catalogLoading">
            <div v-for="cat in catalogCategories" :key="cat.id" class="catalog-group">
              <div class="catalog-cat">
                <span class="catalog-cat-name">{{ cat.name }}</span>
                <a-tag v-if="cat.default_group_id" size="small">默认处理组：{{ groupName(cat.default_group_id) }}</a-tag>
                <a-space size="mini">
                  <a-button type="text" size="mini" @click="openCatalogCreate('item', cat.id)">新增事项</a-button>
                  <a-button type="text" size="mini" @click="openCatalogEdit(cat)">编辑</a-button>
                  <a-popconfirm content="确定删除该分类？有子项或被引用时拒绝" @ok="handleDeleteCatalog(cat.id)">
                    <a-button type="text" size="mini" status="danger">删除</a-button>
                  </a-popconfirm>
                </a-space>
              </div>
              <a-table :data="catalogChildren(cat.id)" :columns="catalogColumns" :pagination="false" size="small" row-key="id">
                <template #difficulty="{ record }">
                  <a-tag size="small" :color="DIFFICULTY_MAP[record.difficulty]?.color || 'gray'">{{ DIFFICULTY_MAP[record.difficulty]?.text || record.difficulty }}</a-tag>
                </template>
                <template #default_type="{ record }">{{ typeMap[record.default_type] || record.default_type }}</template>
                <template #default_group="{ record }">
                  <span v-if="record.default_group_id">{{ groupName(record.default_group_id) }}</span>
                  <span v-else class="inherit-text">继承分类</span>
                </template>
                <template #is_active="{ record }">
                  <a-switch :model-value="record.is_active" size="small" @change="(v: string | number | boolean) => handleToggleCatalog(record, Boolean(v))" />
                </template>
                <template #actions="{ record }">
                  <a-space size="mini">
                    <a-button type="text" size="mini" @click="openCatalogEdit(record)">编辑</a-button>
                    <a-popconfirm content="确定删除该事项？被工单引用时拒绝" @ok="handleDeleteCatalog(record.id)">
                      <a-button type="text" size="mini" status="danger">删除</a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
              </a-table>
            </div>
            <a-empty v-if="!catalogLoading && catalogCategories.length === 0" description="暂无服务目录" />
          </a-spin>
        </a-tab-pane>

        <!-- ========== 处理组 ========== -->
        <a-tab-pane key="groups" title="处理组">
          <div class="tab-toolbar">
            <a-button type="primary" size="small" @click="openGroupModal(null)">
              <template #icon><icon-plus /></template>新增处理组
            </a-button>
            <a-button size="small" @click="fetchGroups">
              <template #icon><icon-refresh /></template>
            </a-button>
          </div>
          <a-table :data="groups" :loading="groupLoading" :columns="groupColumns" :pagination="false" size="small" row-key="id">
            <template #members="{ record }">
              <a-space wrap size="mini">
                <a-tag v-for="m in record.members" :key="m" size="small">{{ userName(m) }}</a-tag>
              </a-space>
              <span v-if="!record.members.length">-</span>
            </template>
            <template #is_active="{ record }">
              <a-switch :model-value="record.is_active" size="small" @change="(v: string | number | boolean) => handleToggleGroup(record, Boolean(v))" />
            </template>
            <template #actions="{ record }">
              <a-space size="mini">
                <a-button type="text" size="mini" @click="openGroupModal(record)">编辑</a-button>
                <a-popconfirm content="确定删除该处理组？被工单引用时拒绝" @ok="handleDeleteGroup(record.id)">
                  <a-button type="text" size="mini" status="danger">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- ========== 值班表 ========== -->
        <a-tab-pane key="oncall" title="值班表">
          <div class="tab-toolbar">
            <a-select v-model="oncallGroupId" placeholder="处理组" allow-clear style="width: 160px" @change="fetchOncall">
              <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
            </a-select>
            <a-space size="mini">
              <a-button type="primary" size="small" @click="openOncallModal(null)">
                <template #icon><icon-plus /></template>新增排班
              </a-button>
              <a-button size="small" @click="fetchOncall">
                <template #icon><icon-refresh /></template>
              </a-button>
            </a-space>
          </div>
          <a-table :data="oncallList" :loading="oncallLoading" :columns="oncallColumns" :pagination="false" size="small" row-key="id">
            <template #oncall_date="{ record }">{{ formatDate(record.oncall_date) }}</template>
            <template #tier1="{ record }">
              <a-space wrap size="mini">
                <a-tag v-for="u in record.tier1" :key="u" size="small">{{ userName(u) }}</a-tag>
              </a-space>
              <span v-if="!record.tier1.length">-</span>
            </template>
            <template #tier2="{ record }">
              <a-space wrap size="mini">
                <a-tag v-for="u in record.tier2" :key="u" size="small">{{ userName(u) }}</a-tag>
              </a-space>
              <span v-if="!record.tier2.length">-</span>
            </template>
            <template #tier3="{ record }">
              <a-space wrap size="mini">
                <a-tag v-for="u in record.tier3" :key="u" size="small">{{ userName(u) }}</a-tag>
              </a-space>
              <span v-if="!record.tier3.length">-</span>
            </template>
            <template #oncall_actions="{ record }">
              <a-space size="mini">
                <a-button type="text" size="mini" @click="openOncallModal(record)">编辑</a-button>
                <a-popconfirm content="确定删除该排班？" @ok="handleDeleteOncall(record.id)">
                  <a-button type="text" size="mini" status="danger">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 目录弹窗：分类/事项双模式 -->
    <a-modal v-model:visible="catalogModalVisible" :title="catalogModalTitle" :width="560" :ok-loading="catalogSaving" @ok="handleSaveCatalog">
      <a-form :model="catalogForm" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="名称">
              <a-input v-model="catalogForm.name" :placeholder="catalogMode === 'category' ? '如：云账号与权限' : '如：ECS 重启 / 数据库扩容'" :disabled="!!catalogForm.id" />
            </a-form-item>
          </a-col>
          <a-col :span="12" v-if="catalogMode === 'item'">
            <a-form-item label="上级分类">
              <a-select :model-value="catalogForm.parent_id" disabled>
                <a-option v-for="c in catalogCategories" :key="c.id" :value="c.id">{{ c.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <template v-if="catalogMode === 'item'">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="难度">
                <a-select v-model="catalogForm.difficulty">
                  <a-option v-for="(m, k) in DIFFICULTY_MAP" :key="k" :value="k">{{ m.text }}</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="默认风险">
                <a-select v-model="catalogForm.default_risk">
                  <a-option value="low">低</a-option>
                  <a-option value="medium">中</a-option>
                  <a-option value="high">高</a-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="默认类型">
                <a-select v-model="catalogForm.default_type">
                  <a-option v-for="(t, k) in typeMap" :key="k" :value="k">{{ t }}</a-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="默认 Runbook">
            <a-select v-model="catalogForm.default_runbook_id" placeholder="可选" allow-clear>
              <a-option v-for="rb in runbookOptions" :key="rb.id" :value="rb.id">{{ rb.name }}</a-option>
            </a-select>
          </a-form-item>
        </template>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="默认处理组">
              <a-select v-model="catalogForm.default_group_id" :placeholder="catalogMode === 'item' ? '可选，留空继承分类' : '可选，应用于整个分类'" allow-clear>
                <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="排序"><a-input-number v-model="catalogForm.sort_order" :min="0" style="width: 100%" /></a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="描述"><a-textarea v-model="catalogForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 处理组弹窗 -->
    <a-modal v-model:visible="groupModalVisible" :title="groupForm.id ? '编辑处理组' : '新增处理组'" :width="480" :ok-loading="groupSaving" @ok="handleSaveGroup">
      <a-form :model="groupForm" layout="vertical">
        <a-form-item label="名称"><a-input v-model="groupForm.name" placeholder="如：数据库组" :disabled="!!groupForm.id" /></a-form-item>
        <a-form-item label="成员">
          <a-select v-model="groupForm.members" multiple allow-search placeholder="选择用户" style="width: 100%">
            <a-option v-for="u in users" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述"><a-textarea v-model="groupForm.description" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 值班弹窗 -->
    <a-modal v-model:visible="oncallModalVisible" :title="oncallForm.id ? '编辑排班' : '新增排班'" :width="520" :ok-loading="oncallSaving" @ok="handleSaveOncall">
      <a-form :model="oncallForm" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="处理组">
              <a-select v-model="oncallForm.group_id" placeholder="请选择" :disabled="!!oncallForm.id">
                <a-option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="值班日期">
              <a-date-picker v-model="oncallForm.oncall_date" value-format="YYYY-MM-DD" style="width: 100%" :disabled="!!oncallForm.id" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="一线值班（tier1，自动派单轮转）">
          <a-select v-model="oncallForm.tier1" multiple allow-search :disabled="!oncallForm.group_id" :placeholder="oncallForm.group_id ? '从处理组值班池选择' : '先选择处理组'" style="width: 100%">
            <a-option v-for="u in oncallCandidates" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="二线支持（tier2）">
          <a-select v-model="oncallForm.tier2" multiple allow-search :disabled="!oncallForm.group_id" :placeholder="oncallForm.group_id ? '可选' : '先选择处理组'" style="width: 100%">
            <a-option v-for="u in oncallCandidates" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="三线支持（tier3）">
          <a-select v-model="oncallForm.tier3" multiple allow-search :disabled="!oncallForm.group_id" :placeholder="oncallForm.group_id ? '可选' : '先选择处理组'" style="width: 100%">
            <a-option v-for="u in oncallCandidates" :key="u.id" :value="u.id">{{ u.display_name || u.username }}</a-option>
          </a-select>
        </a-form-item>
        <p v-if="!oncallForm.group_id" class="inherit-text">值班人员池 = 所选处理组的活跃成员，请先选择处理组</p>
        <a-form-item label="备注"><a-input v-model="oncallForm.note" placeholder="可选" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconRefresh } from '@arco-design/web-vue/es/icon'
import * as metaApi from '../../api/ticketMeta'
import { DIFFICULTY_MAP } from '../../api/ticketMeta'
import type { ICatalogItem, ITicketGroup, IOncallSchedule, IAssigneeCandidate } from '../../api/ticketMeta'
import * as jobApi from '../../api/job'
import type { IRunbook } from '../../api/job'
import { getUserList } from '../../api/user'
import type { IUser } from '../../types/user'

const typeMap: Record<string, string> = { general: '通用', request: '申请', change: '变更', incident: '故障' }

const activeTab = ref('catalog')

// ========== 用户 ==========
const users = ref<IUser[]>([])
const userMap = computed(() => {
  const m: Record<number, string> = {}
  users.value.forEach(u => { m[u.id] = u.display_name || u.username })
  return m
})
function userName(id: number) { return userMap.value[id] || `#${id}` }
async function fetchUsers() {
  try {
    // 后端 page_size 上限 100，分页累加取全，避免成员/值班人选缺失
    const first = await getUserList({ page: 1, page_size: 100 })
    const all = [...first.data.items]
    const total = first.data.pagination.total
    for (let p = 2; all.length < total && p <= 5; p++) {
      const res = await getUserList({ page: p, page_size: 100 })
      all.push(...res.data.items)
    }
    users.value = all
  } catch { /* ignore */ }
}

// ========== 服务目录 ==========
const catalogLoading = ref(false)
const catalogItems = ref<ICatalogItem[]>([])
const catalogCategories = computed(() => catalogItems.value.filter(i => i.parent_id === null))
function catalogChildren(parentId: number) {
  return catalogItems.value.filter(i => i.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)
}

const catalogColumns = [
  { title: '事项', dataIndex: 'name', width: 180, ellipsis: true },
  { title: '难度', slotName: 'difficulty', width: 80 },
  { title: '默认类型', slotName: 'default_type', width: 90 },
  { title: '默认处理组', slotName: 'default_group', width: 120 },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '操作', slotName: 'actions', width: 120 },
]

async function fetchCatalog() {
  catalogLoading.value = true
  try { catalogItems.value = (await metaApi.getCatalog({ include_inactive: true })).data } catch { /* ignore */ } finally { catalogLoading.value = false }
}

const catalogModalVisible = ref(false)
const catalogSaving = ref(false)
// category=一级分类（仅名称/描述/排序） item=二级事项（父分类固定 + 事项级属性）
const catalogMode = ref<'category' | 'item'>('category')
const catalogModalTitle = computed(() => {
  if (catalogForm.id) return catalogMode.value === 'category' ? '编辑分类' : '编辑事项'
  return catalogMode.value === 'category' ? '新增分类' : '新增事项'
})
const catalogForm = reactive({
  id: null as number | null, name: '', parent_id: undefined as number | undefined,
  difficulty: 'simple', default_risk: 'low', default_type: 'request',
  default_runbook_id: undefined as number | undefined, default_group_id: undefined as number | undefined,
  sort_order: 0, description: '',
})

function groupName(id: number | null) {
  if (!id) return '-'
  return groups.value.find(g => g.id === id)?.name || `#${id}`
}

function openCatalogCreate(mode: 'category' | 'item', parentId?: number) {
  catalogMode.value = mode
  Object.assign(catalogForm, {
    id: null, name: '', parent_id: parentId, difficulty: 'simple', default_risk: 'low',
    default_type: 'request', default_runbook_id: undefined, default_group_id: undefined, sort_order: 0, description: '',
  })
  catalogModalVisible.value = true
}

function openCatalogEdit(item: ICatalogItem) {
  catalogMode.value = item.parent_id === null ? 'category' : 'item'
  Object.assign(catalogForm, {
    id: item.id, name: item.name, parent_id: item.parent_id ?? undefined, difficulty: item.difficulty,
    default_risk: item.default_risk, default_type: item.default_type,
    default_runbook_id: item.default_runbook_id ?? undefined, default_group_id: item.default_group_id ?? undefined,
    sort_order: item.sort_order, description: item.description || '',
  })
  catalogModalVisible.value = true
}

async function handleSaveCatalog() {
  if (!catalogForm.name) { Message.warning('请输入名称'); return }
  if (catalogMode.value === 'item' && !catalogForm.parent_id) { Message.warning('事项必须归属一个分类'); return }
  catalogSaving.value = true
  try {
    if (catalogForm.id) {
      // 分类更新时后端自动屏蔽事项级属性，前端同样不发送
      await metaApi.updateCatalogItem(catalogForm.id, {
        description: catalogForm.description || null,
        ...(catalogMode.value === 'item' ? {
          difficulty: catalogForm.difficulty,
          default_risk: catalogForm.default_risk,
          default_type: catalogForm.default_type,
          default_runbook_id: catalogForm.default_runbook_id ?? null,
        } : {}),
        default_group_id: catalogForm.default_group_id ?? null,
        sort_order: catalogForm.sort_order,
      })
    } else if (catalogMode.value === 'category') {
      await metaApi.createCatalogCategory({
        name: catalogForm.name, description: catalogForm.description || null,
        sort_order: catalogForm.sort_order, default_group_id: catalogForm.default_group_id ?? null,
      })
    } else {
      await metaApi.createCatalogItem({
        name: catalogForm.name, parent_id: catalogForm.parent_id as number,
        description: catalogForm.description || null, difficulty: catalogForm.difficulty,
        default_risk: catalogForm.default_risk, default_type: catalogForm.default_type,
        default_runbook_id: catalogForm.default_runbook_id ?? null,
        default_group_id: catalogForm.default_group_id ?? null, sort_order: catalogForm.sort_order,
      })
    }
    Message.success('保存成功')
    catalogModalVisible.value = false
    fetchCatalog()
  } catch { /* 拦截器已提示 */ } finally { catalogSaving.value = false }
}

async function handleToggleCatalog(item: ICatalogItem, isActive: boolean) {
  try { await metaApi.updateCatalogItem(item.id, { is_active: isActive }); item.is_active = isActive } catch { /* 拦截器已提示 */ }
}

async function handleDeleteCatalog(id: number) {
  try { await metaApi.deleteCatalogItem(id); Message.success('已删除'); fetchCatalog() } catch { /* 拦截器已提示 */ }
}

// ========== 处理组 ==========
const groupLoading = ref(false)
const groups = ref<ITicketGroup[]>([])

const groupColumns = [
  { title: '名称', dataIndex: 'name', width: 160, ellipsis: true },
  { title: '成员', slotName: 'members' },
  { title: '启用', slotName: 'is_active', width: 70 },
  { title: '操作', slotName: 'actions', width: 120 },
]

async function fetchGroups() {
  groupLoading.value = true
  try { groups.value = (await metaApi.getGroups({ include_inactive: true })).data } catch { /* ignore */ } finally { groupLoading.value = false }
}

const groupModalVisible = ref(false)
const groupSaving = ref(false)
const groupForm = reactive({ id: null as number | null, name: '', description: '', members: [] as number[] })

function openGroupModal(group: ITicketGroup | null) {
  Object.assign(groupForm, {
    id: group?.id ?? null, name: group?.name ?? '', description: group?.description ?? '', members: [...(group?.members ?? [])],
  })
  groupModalVisible.value = true
}

async function handleSaveGroup() {
  if (!groupForm.name) { Message.warning('请输入名称'); return }
  groupSaving.value = true
  try {
    if (groupForm.id) {
      await metaApi.updateGroup(groupForm.id, { description: groupForm.description || null, members: groupForm.members })
    } else {
      await metaApi.createGroup({ name: groupForm.name, description: groupForm.description || null, members: groupForm.members })
    }
    Message.success('保存成功')
    groupModalVisible.value = false
    fetchGroups()
  } catch { /* 拦截器已提示 */ } finally { groupSaving.value = false }
}

async function handleToggleGroup(group: ITicketGroup, isActive: boolean) {
  try { await metaApi.updateGroup(group.id, { is_active: isActive }); group.is_active = isActive } catch { /* 拦截器已提示 */ }
}

async function handleDeleteGroup(id: number) {
  try { await metaApi.deleteGroup(id); Message.success('已删除'); fetchGroups() } catch { /* 拦截器已提示 */ }
}

// ========== 值班表 ==========
const oncallLoading = ref(false)
const oncallList = ref<IOncallSchedule[]>([])
const oncallGroupId = ref<number | undefined>()

const oncallColumns = [
  { title: '处理组', dataIndex: 'group_name', width: 130 },
  { title: '日期', slotName: 'oncall_date', width: 110 },
  { title: '一线', slotName: 'tier1' },
  { title: '二线', slotName: 'tier2' },
  { title: '三线', slotName: 'tier3' },
  { title: '备注', dataIndex: 'note', ellipsis: true },
  { title: '操作', slotName: 'oncall_actions', width: 120 },
]

async function fetchOncall() {
  oncallLoading.value = true
  try { oncallList.value = (await metaApi.getOncallSchedules({ group_id: oncallGroupId.value })).data } catch { /* ignore */ } finally { oncallLoading.value = false }
}

function formatDate(t: string) { return new Date(t).toLocaleDateString('zh-CN') }

const oncallModalVisible = ref(false)
const oncallSaving = ref(false)
const oncallForm = reactive({
  id: null as number | null, group_id: undefined as number | undefined, oncall_date: '',
  tier1: [] as number[], tier2: [] as number[], tier3: [] as number[], note: '',
})

// 值班池 = 所选处理组的候选人（组活跃成员，唯一合法值班池），禁止全量用户
const oncallCandidates = ref<IAssigneeCandidate[]>([])

async function fetchOncallCandidates(gid: number | undefined) {
  oncallCandidates.value = []
  if (!gid) return
  try { oncallCandidates.value = (await metaApi.getGroupCandidates(gid)).data } catch { /* ignore */ }
}

// 换组时重拉值班池，并过滤掉不在池内的已选人员
watch(() => oncallForm.group_id, async (gid) => {
  await fetchOncallCandidates(gid)
  const ids = new Set(oncallCandidates.value.map(c => c.id))
  oncallForm.tier1 = oncallForm.tier1.filter(id => ids.has(id))
  oncallForm.tier2 = oncallForm.tier2.filter(id => ids.has(id))
  oncallForm.tier3 = oncallForm.tier3.filter(id => ids.has(id))
})

function openOncallModal(s: IOncallSchedule | null) {
  Object.assign(oncallForm, {
    id: s?.id ?? null, group_id: s?.group_id ?? oncallGroupId.value, oncall_date: s ? new Date(s.oncall_date).toISOString().slice(0, 10) : '',
    tier1: [...(s?.tier1 ?? [])], tier2: [...(s?.tier2 ?? [])], tier3: [...(s?.tier3 ?? [])], note: s?.note ?? '',
  })
  fetchOncallCandidates(oncallForm.group_id)
  oncallModalVisible.value = true
}

async function handleSaveOncall() {
  if (!oncallForm.group_id || !oncallForm.oncall_date) { Message.warning('处理组与日期必填'); return }
  oncallSaving.value = true
  try {
    if (oncallForm.id) {
      await metaApi.updateOncallSchedule(oncallForm.id, {
        tier1: oncallForm.tier1, tier2: oncallForm.tier2, tier3: oncallForm.tier3, note: oncallForm.note || null,
      })
    } else {
      await metaApi.createOncallSchedule({
        group_id: oncallForm.group_id, oncall_date: new Date(oncallForm.oncall_date).toISOString(),
        tier1: oncallForm.tier1, tier2: oncallForm.tier2, tier3: oncallForm.tier3, note: oncallForm.note || null,
      })
    }
    Message.success('保存成功')
    oncallModalVisible.value = false
    fetchOncall()
  } catch { /* 拦截器已提示（同组同日期唯一） */ } finally { oncallSaving.value = false }
}

async function handleDeleteOncall(id: number) {
  try { await metaApi.deleteOncallSchedule(id); Message.success('已删除'); fetchOncall() } catch { /* 拦截器已提示 */ }
}

// ========== 初始化 ==========
const runbookOptions = ref<IRunbook[]>([])

onMounted(() => {
  fetchUsers()
  fetchCatalog()
  fetchGroups()
  fetchOncall()
  jobApi.getRunbooks({ page: 1, page_size: 100 }).then(res => { runbookOptions.value = res.data.items }).catch(() => { /* ignore */ })
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.ticket-config { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; gap: $spacing-sm; }

.catalog-group { margin-bottom: $spacing-lg; }
.inherit-text { color: $text-disabled; font-size: $font-size-sm; }
.catalog-cat {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: $spacing-xs; padding: $spacing-xs $spacing-sm;
  background: rgba(22, 119, 255, 0.04); border-radius: $radius-md;
  .catalog-cat-name { font-weight: 600; color: $text-primary; }
}
</style>
