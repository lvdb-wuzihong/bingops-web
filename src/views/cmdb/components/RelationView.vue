<template>
  <div class="relation-view">
    <!-- 视图切换 -->
    <div class="view-switch">
      <a-radio-group v-model="viewMode" type="button" size="small">
        <a-radio value="graph">拓扑图</a-radio>
        <a-radio value="list">列表管理</a-radio>
      </a-radio-group>
    </div>

    <!-- 拓扑图（BlueKing 式：语义分组侧栏 + 层次布局卡片节点） -->
    <div v-show="viewMode === 'graph'" class="topo-body">
      <div class="topo-sidebar">
        <h5>关联关系</h5>
        <template v-if="centerRelationGroups.length">
          <div v-for="g in centerRelationGroups" :key="g.label" class="rel-group">
            <div class="rel-group-label">{{ g.label }}</div>
            <div v-for="item in g.items" :key="item.modelName" class="rel-group-item">
              <span class="rel-model">{{ item.modelName }}</span>
              <span class="rel-count">{{ item.count }}</span>
            </div>
          </div>
        </template>
        <p v-else class="rel-empty">当前资源暂无直接关系</p>
      </div>
      <div class="topo-main">
        <div class="graph-toolbar">
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
        <a-spin :loading="topoLoading" style="width: 100%">
          <div ref="graphRef" class="topo-chart"></div>
        </a-spin>
        <p class="graph-tip">拖拽平移、滚轮缩放；双击节点展开该节点的一度关系；宿主在左、子级与关联在右，卡片角标为模型。</p>
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
import { Graph } from '@antv/g6'
import type { EdgeData, ElementDatum, GraphData, IElementEvent, NodeData, PluginOptions } from '@antv/g6'
import {
  getChildren, getParents, addBelongsTo, removeBelongsTo,
  getRelationsFrom, getRelationsTo, addRelatesTo, removeRelatesTo,
  getResourceTopology,
} from '../../../api/relationship'
import type { IBelongsToRelation, IRelatesToRelation, ITopologyData, ITopologyEdge, ITopologyNode } from '../../../api/relationship'
import { getResourceDetail } from '../../../api/cmdb'

const props = defineProps<{ resourceId: number }>()

// ========== 视图切换 ==========
const viewMode = ref<'graph' | 'list'>('graph')

// ========== 拓扑图（G6） ==========
const graphRef = ref<HTMLElement>()
let graphInstance: Graph | null = null
const topoLoading = ref(false)
const topoData = ref<ITopologyData | null>(null)
const depth = ref(2)

// 模型分类色板（按首次出现顺序取色，同模型同色）
const MODEL_PALETTE = ['#5b8ff9', '#5ad8a6', '#5d7092', '#f6bd16', '#e8684a', '#6dc8ec', '#9270ca', '#ff9d4d', '#269a99', '#ff99c3']

function truncName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 14)}…` : name
}

function modelCategory(n: ITopologyNode): string {
  return n.model_name || n.model_code || '未知模型'
}

function edgeLabel(e: ITopologyEdge): string {
  return e.description || (e.kind ? e.kind : e.relation_type === 'belongs_to' ? '从属' : '关联')
}

// 拓扑数据 → G6 图数据；取色在映射时按序固化进节点数据，保证图例取色一致
function toGraphData(topo: ITopologyData): GraphData {
  const colorMap = new Map<string, string>()
  const colorOf = (category: string): string => {
    let color = colorMap.get(category)
    if (!color) { color = MODEL_PALETTE[colorMap.size % MODEL_PALETTE.length]; colorMap.set(category, color) }
    return color
  }
  return {
    nodes: topo.nodes.map((n) => ({
      id: String(n.id),
      data: { info: n, category: modelCategory(n), color: colorOf(modelCategory(n)) },
    })),
    edges: topo.edges.map((e) => {
      // 层次布局方向归一：belongs_to 反转为父→子（宿主在左、被托管在右）；relates_to 入向反转为中心→对端
      let source = e.source_id
      let target = e.target_id
      if (e.relation_type === 'belongs_to') {
        source = e.target_id
        target = e.source_id
      } else if (e.target_id === topo.center_id) {
        source = e.target_id
        target = e.source_id
      }
      return {
        id: `${e.relation_type}-${e.id}`,
        source: String(source),
        target: String(target),
        data: { info: e, label: edgeLabel(e) },
      }
    }),
  }
}

// 中心资源直接关系的语义聚合（BlueKing 式侧栏：属于 → Node 1 / 组成 → Pod 3）
const centerRelationGroups = computed(() => {
  const topo = topoData.value
  if (!topo) return []
  const nodeById = new Map(topo.nodes.map(n => [n.id, n]))
  const acc = new Map<string, { label: string; modelName: string; count: number }>()
  for (const e of topo.edges) {
    if (e.source_id !== topo.center_id && e.target_id !== topo.center_id) continue
    const label = e.relation_type === 'belongs_to'
      ? (e.source_id === topo.center_id ? '属于' : '组成')
      : (e.description || e.kind || '关联')
    const peerId = e.source_id === topo.center_id ? e.target_id : e.source_id
    const peer = nodeById.get(peerId)
    const modelName = peer ? modelCategory(peer) : '未知模型'
    const key = `${label}::${modelName}`
    const hit = acc.get(key)
    if (hit) hit.count += 1
    else acc.set(key, { label, modelName, count: 1 })
  }
  const grouped = new Map<string, { modelName: string; count: number }[]>()
  for (const { label, modelName, count } of acc.values()) {
    const list = grouped.get(label) ?? []
    list.push({ modelName, count })
    grouped.set(label, list)
  }
  return [...grouped.entries()]
    .map(([label, items]) => ({ label, items: items.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

function nodeTooltip(n: ITopologyNode): string {
  return [
    `<b>${n.name}</b>`,
    `模型：${n.model_name || n.model_code || '-'}`,
    `状态：${n.status}`,
    `厂商：${n.provider || '-'}　地域：${n.region || '-'}`,
  ].join('<br/>')
}

function edgeTooltip(e: ITopologyEdge): string {
  return `${e.relation_type === 'belongs_to' ? '从属' : '关联'}${e.kind ? `（${e.kind}）` : ''}：${e.description || '-'}`
}

function renderGraph() {
  if (!graphRef.value || !topoData.value) return
  // 分类数 > 1 才挂图例（与旧 ECharts 行为一致）
  const categories = [...new Set(topoData.value.nodes.map(modelCategory))]
  const plugins: PluginOptions = [{
    type: 'tooltip',
    key: 'topo-tooltip',
    getContent: async (event: IElementEvent, items: ElementDatum[]) => {
      const datum = items[0]
      if (!datum?.data) return ''
      const { info } = datum.data as { info: ITopologyNode | ITopologyEdge }
      return event.targetType === 'node' ? nodeTooltip(info as ITopologyNode) : edgeTooltip(info as ITopologyEdge)
    },
  }]
  if (categories.length > 1) {
    plugins.push({ type: 'legend', key: 'topo-legend', nodeField: 'category', position: 'top', trigger: 'hover' })
  }

  if (!graphInstance) {
    graphInstance = new Graph({
      container: graphRef.value,
      autoResize: true,
      autoFit: 'view',
      padding: 24,
      data: toGraphData(topoData.value),
      node: {
        type: 'rect',
        style: (d: NodeData) => {
          const { info, color } = d.data as { info: ITopologyNode; color: string }
          return {
            size: [176, 44],
            fill: '#ffffff',
            stroke: info.is_center ? '#1677ff' : color,
            lineWidth: info.is_center ? 2.5 : 1.2,
            radius: 8,
            shadowColor: info.is_center ? 'rgba(22, 119, 255, 0.25)' : 'rgba(0, 0, 0, 0.06)',
            shadowBlur: info.is_center ? 12 : 4,
            labelText: truncName(info.name),
            labelPlacement: 'center',
            labelFontSize: 12,
            labelFontWeight: info.is_center ? 700 : 500,
            labelFill: info.is_center ? '#1677ff' : '#1d2129',
            badge: !info.is_center,
            badgeText: info.model_code || 'CI',
            badgePlacement: 'right-top',
            badgeFontSize: 9,
            badgeBackgroundColor: color,
            badgePadding: [1, 4],
          }
        },
        state: {
          active: { halo: true },
          dim: { fillOpacity: 0.2, strokeOpacity: 0.2, labelFillOpacity: 0.2 },
        },
      },
      edge: {
        style: (d: EdgeData) => {
          const { info, label } = d.data as { info: ITopologyEdge; label: string }
          return {
            stroke: info.relation_type === 'belongs_to' ? '#1677ff' : '#52c41a',
            lineWidth: 1.4,
            labelText: label,
            labelFontSize: 10,
            labelFill: '#86909c',
            labelBackground: true,
            labelBackgroundFill: 'rgba(255, 255, 255, 0.85)',
            labelBackgroundRadius: 4,
          }
        },
        state: {
          active: { lineWidth: 2.5 },
          dim: { strokeOpacity: 0.2, labelFillOpacity: 0.2 },
        },
      },
      // BlueKing 式层次布局：宿主在左、子级与关联在右（边方向已在 toGraphData 归一）
      layout: {
        type: 'antv-dagre',
        rankdir: 'LR',
        nodesep: 14,
        ranksep: 64,
        animation: true,
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'drag-element',
        { type: 'hover-activate', degree: 1, direction: 'both', inactiveState: 'dim' },
      ],
      plugins,
    })
    graphInstance.on('node:dblclick', (event: IElementEvent) => {
      const id = Number((event.target as { id?: string | number }).id)
      if (!Number.isNaN(id)) expandNode(id)
    })
  } else {
    graphInstance.setData(toGraphData(topoData.value))
    graphInstance.setPlugins(plugins)
  }
  graphInstance.render()
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

watch(viewMode, (mode) => {
  if (mode === 'graph') nextTick(() => graphInstance?.resize())
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
})

// 父页路由参数变化（点击关联资源跳转，组件复用）：重置名称缓存并重拉
watch(() => props.resourceId, () => {
  resourceNameMap.value = {}
  fetchTopology()
  fetchParents()
  fetchChildren()
  fetchRelations()
})

onUnmounted(() => {
  graphInstance?.destroy()
  graphInstance = null
})
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.relation-view { display: flex; flex-direction: column; gap: $spacing-md; }

.view-switch { display: flex; justify-content: space-between; align-items: center; gap: $spacing-sm; flex-wrap: wrap; }

.graph-toolbar { display: flex; align-items: center; gap: $spacing-sm; }
.toolbar-label { font-size: $font-size-xs; color: $text-secondary; }

.topo-body { display: flex; gap: $spacing-md; align-items: stretch; }

.topo-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
  padding: $spacing-sm $spacing-md;

  h5 { margin: 0 0 $spacing-xs; font-size: $font-size-sm; color: $text-primary; }
}

.rel-group { margin-bottom: $spacing-xs; }
.rel-group-label { font-size: $font-size-xs; color: $color-primary; font-weight: 600; margin-bottom: 2px; }
.rel-group-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px $spacing-xs; border-radius: $radius-sm;
  font-size: $font-size-xs; color: $text-secondary;
  &:hover { background: rgba(22, 119, 255, 0.05); }
}
.rel-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel-count {
  color: $color-primary; font-weight: 600;
  background: rgba(22, 119, 255, 0.08); border-radius: 8px; padding: 0 6px;
}
.rel-empty { font-size: $font-size-xs; color: $text-disabled; }

.topo-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

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
