<template>
  <div class="relation-view">
    <!-- 视图切换 -->
    <div class="view-switch">
      <a-radio-group v-model="viewMode" type="button" size="small">
        <a-radio value="graph">拓扑图</a-radio>
        <a-radio value="list">列表管理</a-radio>
      </a-radio-group>
      <div v-if="viewMode === 'graph'" class="graph-toolbar">
        <a-tag v-if="topoData?.truncated" color="orangered" size="small">高扇出截断，仅展示部分邻居</a-tag>
        <span class="toolbar-label">深度</span>
        <a-select v-model="depth" size="small" style="width: 64px" @change="fetchTopology">
          <a-option :value="1">1</a-option>
          <a-option :value="2">2</a-option>
          <a-option :value="3">3</a-option>
        </a-select>
        <a-button size="small" @click="fetchTopology">
          <template #icon><icon-refresh /></template>
        </a-button>
      </div>
    </div>

    <!-- 拓扑图 -->
    <div v-show="viewMode === 'graph'" class="topo-body">
      <!-- 中心资源直接关系语义分组 -->
      <div class="topo-sidebar">
        <h5>关联关系</h5>
        <template v-if="centerRelationGroups.length">
          <div v-for="g in centerRelationGroups" :key="g.label" class="rel-group">
            <div class="rel-group-label">{{ g.label }}</div>
            <div v-for="item in g.items" :key="item.modelName" class="rel-group-item">
              <span>{{ item.modelName }}</span>
              <span class="rel-count">{{ item.count }}</span>
            </div>
          </div>
        </template>
        <p v-else class="rel-empty">当前资源暂无直接关系</p>
      </div>
      <div class="topo-main">
        <a-spin :loading="topoLoading" style="width: 100%">
          <div ref="graphRef" class="topo-chart"></div>
        </a-spin>
        <p class="graph-tip">层次布局：祖先在左、后代在右、关联在最右；拖拽平移、滚轮缩放，双击节点展开其一度关系。</p>
      </div>
    </div>

    <!-- 列表管理 -->
    <div v-show="viewMode === 'list'">
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
                    {{ resourceNameMap[record.parent_id] || `#${record.parent_id}` }}
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
                    {{ resourceNameMap[record.child_id] || `#${record.child_id}` }}
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
              {{ resourceNameMap[record.source_id === resourceId ? record.target_id : record.source_id] || `#${record.source_id === resourceId ? record.target_id : record.source_id}` }}
            </a-link>
          </template>
          <template #actions="{ record }">
            <a-popconfirm content="确定移除该关联关系？" @ok="handleRemoveRelatesTo(record.id)">
              <a-button type="text" size="mini" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </template>
        </a-table>
      </div>
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
        <a-form-item label="描述">
          <a-input v-model="belongsToForm.description" placeholder="可选，如：集群归属、调度于" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加关联弹窗 -->
    <a-modal v-model:visible="showRelatesToModal" title="添加关联关系" :width="480" :ok-loading="relatesToLoading" @ok="handleAddRelatesTo">
      <a-form :model="relatesToForm" layout="vertical">
        <a-form-item label="目标资源 ID">
          <a-input-number v-model="relatesToForm.targetId" placeholder="请输入资源 ID" style="width: 100%" />
        </a-form-item>
        <a-form-item label="描述">
          <a-input v-model="relatesToForm.description" placeholder="可选，如：selector 匹配、承载于" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconDelete, IconRefresh } from '@arco-design/web-vue/es/icon'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import {
  getChildren, getParents, addBelongsTo, removeBelongsTo,
  getRelationsFrom, getRelationsTo, addRelatesTo, removeRelatesTo,
  getResourceTopology,
} from '../../../api/relationship'
import type { IBelongsToRelation, IRelatesToRelation, ITopologyData, ITopologyNode } from '../../../api/relationship'
import { getResourceDetail } from '../../../api/cmdb'

use([CanvasRenderer, GraphChart, TooltipComponent])

const props = defineProps<{ resourceId: number }>()

// ========== 视图切换 ==========
const viewMode = ref<'graph' | 'list'>('graph')

// ========== 拓扑图 ==========
const graphRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null
const topoLoading = ref(false)
const topoData = ref<ITopologyData | null>(null)
const depth = ref(2)

function truncName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 14)}…` : name
}

// ========== 层次布局：祖先在左、后代在右、关联在最右 ==========
const CARD_W = 170
const CARD_H = 46
const COL_GAP = 100
const ROW_GAP = 34

function computeLayout(data: ITopologyData): Record<number, { x: number; y: number }> {
  const parentsOf = new Map<number, number[]>()
  const childrenOf = new Map<number, number[]>()
  const push = (m: Map<number, number[]>, k: number, v: number) => { m.set(k, [...(m.get(k) || []), v]) }
  for (const e of data.edges) {
    if (e.relation_type !== 'belongs_to') continue
    push(parentsOf, e.source_id, e.target_id)
    push(childrenOf, e.target_id, e.source_id)
  }
  const level = new Map<number, number>([[data.center_id, 0]])
  // 上游 BFS：祖先负层
  let front = [data.center_id]
  while (front.length) {
    const next: number[] = []
    for (const id of front) for (const p of parentsOf.get(id) || []) if (!level.has(p)) { level.set(p, (level.get(id) ?? 0) - 1); next.push(p) }
    front = next
  }
  // 下游 BFS：后代正层
  front = [data.center_id]
  while (front.length) {
    const next: number[] = []
    for (const id of front) for (const c of childrenOf.get(id) || []) if (!level.has(c)) { level.set(c, (level.get(id) ?? 0) + 1); next.push(c) }
    front = next
  }
  // 关联（relates_to）对端未布局者放最右列
  let maxLevel = 0
  level.forEach(l => { if (l > maxLevel) maxLevel = l })
  for (const e of data.edges) {
    if (e.relation_type !== 'relates_to') continue
    for (const id of [e.source_id, e.target_id]) {
      if (id !== data.center_id && !level.has(id)) level.set(id, maxLevel + 1)
    }
  }
  // 按层居中垂直排布
  const byLevel = new Map<number, number[]>()
  level.forEach((l, id) => { byLevel.set(l, [...(byLevel.get(l) || []), id]) })
  const pos: Record<number, { x: number; y: number }> = {}
  byLevel.forEach((ids, l) => {
    ids.sort((a, b) => a - b)
    ids.forEach((id, i) => {
      pos[id] = { x: l * (CARD_W + COL_GAP), y: (i - (ids.length - 1) / 2) * (CARD_H + ROW_GAP) }
    })
  })
  return pos
}

// 中心资源直接关系的语义分组（左侧栏）
const centerRelationGroups = computed(() => {
  const data = topoData.value
  if (!data) return [] as { label: string; items: { modelName: string; count: number }[] }[]
  const nodeById = new Map(data.nodes.map(n => [n.id, n]))
  const groups = new Map<string, Map<string, number>>()
  for (const e of data.edges) {
    let counterpartId: number | null = null
    let label = ''
    if (e.relation_type === 'belongs_to') {
      if (e.source_id === data.center_id) { counterpartId = e.target_id; label = e.description || '属于' }
      else if (e.target_id === data.center_id) { counterpartId = e.source_id; label = e.description || '组成' }
    } else if (e.source_id === data.center_id || e.target_id === data.center_id) {
      counterpartId = e.source_id === data.center_id ? e.target_id : e.source_id
      label = e.description || e.kind || '关联'
    }
    if (counterpartId === null) continue
    const counterpart = nodeById.get(counterpartId)
    const modelName = counterpart?.model_name || counterpart?.model_code || '未知模型'
    const items = groups.get(label) || new Map<string, number>()
    items.set(modelName, (items.get(modelName) || 0) + 1)
    groups.set(label, items)
  }
  return [...groups.entries()].map(([label, items]) => ({
    label,
    items: [...items.entries()].map(([modelName, count]) => ({ modelName, count })),
  }))
})

function renderGraph() {
  if (!graphRef.value || !topoData.value) return
  if (!chartInstance) chartInstance = echarts.init(graphRef.value)

  const { nodes, edges } = topoData.value
  const pos = computeLayout(topoData.value)

  // 卡片式节点：白底圆角矩形 + 名称/模型两行富文本
  const data = nodes.map(n => ({
    id: String(n.id),
    name: n.name,
    x: pos[n.id]?.x ?? 0,
    y: pos[n.id]?.y ?? 0,
    symbol: 'roundRect',
    symbolSize: [CARD_W, CARD_H],
    itemStyle: n.is_center
      ? { color: '#ffffff', borderColor: '#1677ff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(22,119,255,0.25)' }
      : { color: '#ffffff', borderColor: '#d6e4ff', borderWidth: 1, shadowBlur: 4, shadowColor: 'rgba(22,119,255,0.08)' },
    label: {
      show: true,
      position: 'inside',
      formatter: `{name|${truncName(n.name)}}\n{model|${truncName(n.model_name || n.model_code || '')}}`,
      rich: {
        name: { fontSize: 12, color: '#1d2129', fontWeight: 600, lineHeight: 20 },
        model: { fontSize: 10, color: '#86909c', lineHeight: 14 },
      },
    },
    nodeInfo: n,
  }))
  const links = edges.map(e => ({
    source: String(e.source_id),
    target: String(e.target_id),
    edgeLabel: e.description || (e.kind ? e.kind : e.relation_type === 'belongs_to' ? '从属' : '关联'),
    lineStyle: { color: e.relation_type === 'belongs_to' ? '#597ef7' : '#52c41a', width: 1.5, curveness: 0 },
    edgeInfo: e,
  }))

  chartInstance.setOption({
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: '#d6e4ff',
      textStyle: { color: '#1d39c4', fontSize: 12 },
      formatter: (p: unknown) => {
        const params = p as { dataType?: string; data?: { nodeInfo?: ITopologyNode; edgeInfo?: ITopologyData['edges'][number] } }
        if (params.dataType === 'node' && params.data?.nodeInfo) {
          const n = params.data.nodeInfo
          return [
            `<b>${n.name}</b>`,
            `模型：${n.model_name || n.model_code || '-'}`,
            `状态：${n.status}`,
            `厂商：${n.provider || '-'}　地域：${n.region || '-'}`,
          ].join('<br/>')
        }
        if (params.dataType === 'edge' && params.data?.edgeInfo) {
          const e = params.data.edgeInfo
          return `${e.relation_type === 'belongs_to' ? '从属' : '关联'}${e.kind ? `（${e.kind}）` : ''}：${e.description || '-'}`
        }
        return ''
      },
    },
    series: [{
      type: 'graph',
      layout: 'none',
      data,
      links,
      roam: true,
      draggable: true,
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 7,
      edgeLabel: {
        show: true,
        fontSize: 10,
        color: '#86909c',
        formatter: (p: unknown) => String((p as { data?: { edgeLabel?: string } }).data?.edgeLabel ?? ''),
      },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
    }],
  }, true)

  chartInstance.off('dblclick')
  chartInstance.on('dblclick', (params) => {
    const p = params as { dataType?: string; data?: { nodeInfo?: ITopologyNode } }
    if (p.dataType === 'node' && p.data?.nodeInfo) expandNode(p.data.nodeInfo.id)
  })
}

async function fetchTopology() {
  topoLoading.value = true
  try {
    const res = await getResourceTopology(props.resourceId, depth.value)
    topoData.value = res.data
    await nextTick()
    renderGraph()
  } catch { /* 拦截器已提示 */ } finally { topoLoading.value = false }
}

// 双击节点：拉取该节点一度子图并合并进当前图
async function expandNode(nodeId: number) {
  try {
    const res = await getResourceTopology(nodeId, 1)
    const cur = topoData.value
    if (!cur) return
    const nodeIds = new Set(cur.nodes.map(n => n.id))
    const edgeIds = new Set(cur.edges.map(e => e.id))
    topoData.value = {
      ...cur,
      nodes: [...cur.nodes, ...res.data.nodes.filter(n => !nodeIds.has(n.id)).map(n => ({ ...n, is_center: false }))],
      edges: [...cur.edges, ...res.data.edges.filter(e => !edgeIds.has(e.id))],
    }
    renderGraph()
  } catch { /* ignore */ }
}

function handleResize() { chartInstance?.resize() }

watch(viewMode, (mode) => {
  if (mode === 'graph') nextTick(() => chartInstance?.resize())
})

// ========== 资源名称反查（列表视图用） ==========
const resourceNameMap = ref<Record<number, string>>({})

async function resolveResourceNames(ids: number[]) {
  const missing = [...new Set(ids)].filter((id) => resourceNameMap.value[id] === undefined)
  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await getResourceDetail(id)
        resourceNameMap.value[id] = res.data.name
      } catch {
        // 资源不存在或无权限，展示 #id 兜底
      }
    }),
  )
}

// ========== 从属关系 ==========
const parents = ref<IBelongsToRelation[]>([])
const children = ref<IBelongsToRelation[]>([])
const parentsLoading = ref(false)
const childrenLoading = ref(false)

const parentColumns = [
  { title: '资源名称', slotName: 'parent_name' },
  { title: '描述', dataIndex: 'description', width: 140 },
  { title: '操作', slotName: 'actions', width: 60 },
]
const childColumns = [
  { title: '资源名称', slotName: 'child_name' },
  { title: '描述', dataIndex: 'description', width: 140 },
  { title: '操作', slotName: 'actions', width: 60 },
]

async function fetchParents() {
  parentsLoading.value = true
  try {
    const res = await getParents(props.resourceId)
    parents.value = res.data
    resolveResourceNames(res.data.map((r) => r.parent_id))
  } catch { /* ignore */ } finally { parentsLoading.value = false }
}

async function fetchChildren() {
  childrenLoading.value = true
  try {
    const res = await getChildren(props.resourceId)
    children.value = res.data
    resolveResourceNames(res.data.map((r) => r.child_id))
  } catch { /* ignore */ } finally { childrenLoading.value = false }
}

// 添加从属
const showBelongsToModal = ref(false)
const belongsToLoading = ref(false)
const belongsToForm = reactive({ direction: 'parent' as 'parent' | 'child', targetId: undefined as number | undefined, description: '' })

async function handleAddBelongsTo() {
  if (!belongsToForm.targetId) { Message.warning('请填写目标资源 ID'); return }
  belongsToLoading.value = true
  try {
    if (belongsToForm.direction === 'parent') {
      await addBelongsTo({ child_id: props.resourceId, parent_id: belongsToForm.targetId, description: belongsToForm.description || null })
    } else {
      await addBelongsTo({ child_id: belongsToForm.targetId, parent_id: props.resourceId, description: belongsToForm.description || null })
    }
    Message.success('添加成功')
    showBelongsToModal.value = false
    fetchParents()
    fetchChildren()
    fetchTopology()
  } catch { Message.error('添加失败') } finally { belongsToLoading.value = false }
}

async function handleRemoveBelongsTo(relationId: number) {
  try { await removeBelongsTo(relationId); Message.success('移除成功'); fetchParents(); fetchChildren(); fetchTopology() } catch { Message.error('移除失败') }
}

// ========== 关联关系 ==========
const relationsFrom = ref<IRelatesToRelation[]>([])
const relationsTo = ref<IRelatesToRelation[]>([])
const relationsLoading = ref(false)

const allRelations = computed(() => [...relationsFrom.value, ...relationsTo.value])

const relatesColumns = [
  { title: '方向', slotName: 'direction', width: 90 },
  { title: '关联资源', slotName: 'peer_name' },
  { title: '描述', dataIndex: 'description', width: 140 },
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
    const peerIds = [
      ...fromRes.data.map((r) => r.target_id),
      ...toRes.data.map((r) => r.source_id),
    ]
    resolveResourceNames(peerIds)
  } catch { /* ignore */ } finally { relationsLoading.value = false }
}

// 添加关联
const showRelatesToModal = ref(false)
const relatesToLoading = ref(false)
const relatesToForm = reactive({ targetId: undefined as number | undefined, description: '' })

async function handleAddRelatesTo() {
  if (!relatesToForm.targetId) { Message.warning('请填写目标资源 ID'); return }
  relatesToLoading.value = true
  try {
    await addRelatesTo({ source_id: props.resourceId, target_id: relatesToForm.targetId, description: relatesToForm.description || null })
    Message.success('添加成功')
    showRelatesToModal.value = false
    fetchRelations()
    fetchTopology()
  } catch { Message.error('添加失败') } finally { relatesToLoading.value = false }
}

async function handleRemoveRelatesTo(relationId: number) {
  try { await removeRelatesTo(relationId); Message.success('移除成功'); fetchRelations(); fetchTopology() } catch { Message.error('移除失败') }
}

onMounted(() => {
  fetchTopology()
  fetchParents()
  fetchChildren()
  fetchRelations()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.relation-view { display: flex; flex-direction: column; gap: $spacing-md; }

.view-switch { display: flex; justify-content: space-between; align-items: center; gap: $spacing-sm; flex-wrap: wrap; }

.graph-toolbar { display: flex; align-items: center; gap: $spacing-sm; }
.toolbar-label { font-size: $font-size-xs; color: $text-secondary; }

.topo-body { display: flex; gap: $spacing-sm; align-items: stretch; }

.topo-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  padding: $spacing-sm;
  max-height: 520px;
  overflow-y: auto;

  h5 { margin: 0 0 $spacing-sm; font-size: $font-size-sm; font-weight: 600; color: $text-primary; }
}

.rel-group { margin-bottom: $spacing-sm; }
.rel-group-label { font-size: $font-size-xs; color: $text-secondary; margin-bottom: 4px; }
.rel-group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: $font-size-sm;
  color: $text-body;
  padding: 2px 0;
}
.rel-count {
  min-width: 20px;
  text-align: center;
  font-size: $font-size-xs;
  color: $text-secondary;
  background: rgba(22, 119, 255, 0.08);
  border-radius: 4px;
  padding: 0 4px;
}
.rel-empty { font-size: $font-size-xs; color: $text-disabled; }

.topo-main { flex: 1; min-width: 0; }

.topo-chart {
  width: 100%;
  height: 520px;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}

.graph-tip { margin: $spacing-xs 0 0; font-size: $font-size-xs; color: $text-secondary; }

.relation-section { display: flex; flex-direction: column; gap: $spacing-sm; }
.section-header { display: flex; justify-content: space-between; align-items: center; h4 { margin: 0; font-size: $font-size-base; color: $text-primary; } }
</style>
