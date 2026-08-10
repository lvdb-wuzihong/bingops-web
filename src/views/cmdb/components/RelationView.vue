<template>
  <div class="relation-view">
    <!-- 从属关系 -->
    <div class="relation-section">
      <div class="section-header">
        <h4>从属关系 (Belongs-To)</h4>
        <a-button type="primary" size="small" @click="showBelongsToModal = true">
          <template #icon><icon-plus /></template>添加从属
        </a-button>
      </div>
      <a-row :gutter="16">
        <a-col :span="12">
          <a-card :bordered="false" title="上级 (Parents)" size="small">
            <a-table :data="parents" :columns="parentColumns" :pagination="false" :loading="parentsLoading" size="small" row-key="id">
              <template #parent_name="{ record }">
                <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.parent_id) } })">
                  {{ record.parent_name || `#${record.parent_id}` }}
                </a-link>
              </template>
              <template #actions="{ record }">
                <a-popconfirm content="确定移除该从属关系？" @ok="handleRemoveBelongsTo(record.id)">
                  <a-button type="text" size="mini" status="danger"><template #icon><icon-delete /></template></a-button>
                </a-popconfirm>
              </template>
            </a-table>
          </a-card>
        </a-col>
        <a-col :span="12">
          <a-card :bordered="false" title="下级 (Children)" size="small">
            <a-table :data="children" :columns="childColumns" :pagination="false" :loading="childrenLoading" size="small" row-key="id">
              <template #child_name="{ record }">
                <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.child_id) } })">
                  {{ record.child_name || `#${record.child_id}` }}
                </a-link>
              </template>
              <template #actions="{ record }">
                <a-popconfirm content="确定移除该从属关系？" @ok="handleRemoveBelongsTo(record.id)">
                  <a-button type="text" size="mini" status="danger"><template #icon><icon-delete /></template></a-button>
                </a-popconfirm>
              </template>
            </a-table>
          </a-card>
        </a-col>
      </a-row>
    </div>

    <!-- 关联关系 -->
    <div class="relation-section">
      <div class="section-header">
        <h4>关联关系 (Relates-To)</h4>
        <a-button type="primary" size="small" @click="showRelatesToModal = true">
          <template #icon><icon-plus /></template>添加关联
        </a-button>
      </div>
      <a-table :data="allRelations" :columns="relatesColumns" :pagination="false" :loading="relationsLoading" size="small" row-key="id">
        <template #direction="{ record }">
          <a-tag :color="record.source_id === resourceId ? 'blue' : 'green'" size="small">
            {{ record.source_id === resourceId ? '→ 出向' : '← 入向' }}
          </a-tag>
        </template>
        <template #peer_name="{ record }">
          <a-link @click="$router.push({ name: 'ResourceDetail', params: { id: String(record.source_id === resourceId ? record.target_id : record.source_id) } })">
            {{ record.source_id === resourceId ? (record.target_name || `#${record.target_id}`) : (record.source_name || `#${record.source_id}`) }}
          </a-link>
        </template>
        <template #actions="{ record }">
          <a-popconfirm content="确定移除该关联关系？" @ok="handleRemoveRelatesTo(record.id)">
            <a-button type="text" size="mini" status="danger"><template #icon><icon-delete /></template></a-button>
          </a-popconfirm>
        </template>
      </a-table>
    </div>

    <!-- 添加从属弹窗 -->
    <a-modal v-model:visible="showBelongsToModal" title="添加从属关系" :width="480" :ok-loading="belongsToLoading" @ok="handleAddBelongsTo">
      <a-form :model="belongsToForm" layout="vertical">
        <a-form-item label="关系方向">
          <a-radio-group v-model="belongsToForm.direction">
            <a-radio value="parent">当前资源是子级，添加父级</a-radio>
            <a-radio value="child">当前资源是父级，添加子级</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="目标资源 ID">
          <a-input-number v-model="belongsToForm.targetId" placeholder="请输入资源 ID" style="width: 100%" />
        </a-form-item>
        <a-form-item label="关系类型">
          <a-input v-model="belongsToForm.relationType" placeholder="如：host_in_vpc, pod_in_namespace" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加关联弹窗 -->
    <a-modal v-model:visible="showRelatesToModal" title="添加关联关系" :width="480" :ok-loading="relatesToLoading" @ok="handleAddRelatesTo">
      <a-form :model="relatesToForm" layout="vertical">
        <a-form-item label="目标资源 ID">
          <a-input-number v-model="relatesToForm.targetId" placeholder="请输入资源 ID" style="width: 100%" />
        </a-form-item>
        <a-form-item label="关系类型">
          <a-input v-model="relatesToForm.relationType" placeholder="如：service_to_pod, db_to_app" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconDelete } from '@arco-design/web-vue/es/icon'
import { getChildren, getParents, addBelongsTo, removeBelongsTo, getRelationsFrom, getRelationsTo, addRelatesTo, removeRelatesTo } from '../../api/relationship'
import type { IBelongsToRelation, IRelatesToRelation } from '../../api/relationship'

const props = defineProps<{ resourceId: number }>()

// ========== 从属关系 ==========
const parents = ref<IBelongsToRelation[]>([])
const children = ref<IBelongsToRelation[]>([])
const parentsLoading = ref(false)
const childrenLoading = ref(false)

const parentColumns = [
  { title: '资源名称', slotName: 'parent_name' },
  { title: '关系类型', dataIndex: 'relation_type', width: 140 },
  { title: '操作', slotName: 'actions', width: 60 },
]
const childColumns = [
  { title: '资源名称', slotName: 'child_name' },
  { title: '关系类型', dataIndex: 'relation_type', width: 140 },
  { title: '操作', slotName: 'actions', width: 60 },
]

async function fetchParents() {
  parentsLoading.value = true
  try { const res = await getParents(props.resourceId); parents.value = res.data } catch { /* ignore */ } finally { parentsLoading.value = false }
}

async function fetchChildren() {
  childrenLoading.value = true
  try { const res = await getChildren(props.resourceId); children.value = res.data } catch { /* ignore */ } finally { childrenLoading.value = false }
}

// 添加从属
const showBelongsToModal = ref(false)
const belongsToLoading = ref(false)
const belongsToForm = reactive({ direction: 'parent' as 'parent' | 'child', targetId: undefined as number | undefined, relationType: '' })

async function handleAddBelongsTo() {
  if (!belongsToForm.targetId || !belongsToForm.relationType) { Message.warning('请填写完整'); return }
  belongsToLoading.value = true
  try {
    if (belongsToForm.direction === 'parent') {
      await addBelongsTo({ child_id: props.resourceId, parent_id: belongsToForm.targetId, relation_type: belongsToForm.relationType })
    } else {
      await addBelongsTo({ child_id: belongsToForm.targetId, parent_id: props.resourceId, relation_type: belongsToForm.relationType })
    }
    Message.success('添加成功')
    showBelongsToModal.value = false
    fetchParents()
    fetchChildren()
  } catch { Message.error('添加失败') } finally { belongsToLoading.value = false }
}

async function handleRemoveBelongsTo(relationId: number) {
  try { await removeBelongsTo(relationId); Message.success('移除成功'); fetchParents(); fetchChildren() } catch { Message.error('移除失败') }
}

// ========== 关联关系 ==========
const relationsFrom = ref<IRelatesToRelation[]>([])
const relationsTo = ref<IRelatesToRelation[]>([])
const relationsLoading = ref(false)

const allRelations = computed(() => [...relationsFrom.value, ...relationsTo.value])

const relatesColumns = [
  { title: '方向', slotName: 'direction', width: 90 },
  { title: '关联资源', slotName: 'peer_name' },
  { title: '关系类型', dataIndex: 'relation_type', width: 140 },
  { title: '操作', slotName: 'actions', width: 60 },
]

async function fetchRelations() {
  relationsLoading.value = true
  try {
    const [fromRes, toRes] = await Promise.all([
      getRelationsFrom(props.resourceId),
      getRelationsTo(props.resourceId),
    ])
    relationsFrom.value = fromRes.data
    relationsTo.value = toRes.data
  } catch { /* ignore */ } finally { relationsLoading.value = false }
}

// 添加关联
const showRelatesToModal = ref(false)
const relatesToLoading = ref(false)
const relatesToForm = reactive({ targetId: undefined as number | undefined, relationType: '' })

async function handleAddRelatesTo() {
  if (!relatesToForm.targetId || !relatesToForm.relationType) { Message.warning('请填写完整'); return }
  relatesToLoading.value = true
  try {
    await addRelatesTo({ source_id: props.resourceId, target_id: relatesToForm.targetId, relation_type: relatesToForm.relationType })
    Message.success('添加成功')
    showRelatesToModal.value = false
    fetchRelations()
  } catch { Message.error('添加失败') } finally { relatesToLoading.value = false }
}

async function handleRemoveRelatesTo(relationId: number) {
  try { await removeRelatesTo(relationId); Message.success('移除成功'); fetchRelations() } catch { Message.error('移除失败') }
}

onMounted(() => { fetchParents(); fetchChildren(); fetchRelations() })
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.relation-view { display: flex; flex-direction: column; gap: $spacing-lg; }
.relation-section { display: flex; flex-direction: column; gap: $spacing-sm; }
.section-header { display: flex; justify-content: space-between; align-items: center; h4 { margin: 0; font-size: $font-size-base; color: $text-primary; } }
</style>
