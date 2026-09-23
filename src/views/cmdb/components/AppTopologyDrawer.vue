<template>
  <a-drawer v-model:visible="visibleProxy" :width="980" :footer="false" unmount-on-close>
    <template #title>
      <a-space wrap>
        <span>应用关系视图</span>
        <!-- 环境筛选：按环境标签过滤资源节点（后端 ?env=）；候选来自标签定义 env 允许值 -->
        <a-select v-model="envFilter" size="small" placeholder="全部环境" allow-clear style="width: 120px">
          <a-option v-for="e in envOptions" :key="e" :value="e">{{ e }}</a-option>
        </a-select>
        <template v-if="topo">
          <a-tag size="small" color="arcoblue">依赖 {{ relCount('depends_on') }}</a-tag>
          <a-tag size="small" color="green">被依赖 {{ relCount('depended_by') }}</a-tag>
          <a-tag size="small" color="gold">外部 {{ relCount('external_dependency') }}</a-tag>
          <a-tag size="small" color="gray">承载资源 {{ relCount('hosts_resource') }}</a-tag>
          <a-tag v-if="relCount('shared_resource')" size="small" color="orangered">共享 {{ relCount('shared_resource') }}</a-tag>
        </template>
      </a-space>
    </template>

    <a-spin :loading="loading" style="width: 100%">
      <div ref="chartRef" class="app-topo-chart"></div>
      <p class="topo-tip">
        外部系统在顶、应用居中、承载资源在底；实线 = 依赖 / 被依赖 / 承载，橙色虚线 = 共享资源（存储级耦合信号）；双击应用节点无展开动作，层级由深度 1 聚合决定。
      </p>
    </a-spin>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { BaseNode, ExtensionCategory, Graph, register } from '@antv/g6'
import type { DisplayObject, Group } from '@antv/g'
import type { BaseNodeStyleProps, EdgeData, ElementDatum, IElementEvent, NodeData } from '@antv/g6'
import { getAppTopology } from '../../../api/app'
import type { AppTopologyRelation, IAppTopologyData, IAppTopologyEdge, IAppTopologyNode } from '../../../api/app'
import { iconUriFor } from '../../../assets/brand-icons'
import { MODEL_LAYER_MAP } from '../../../types/model'
import { getTagDefinitions } from '../../../api/tag'

const props = defineProps<{ appId: number | null; visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visibleProxy = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ── BlueKing 式卡片节点（应用拓扑版：类型图标块 + 名称/副行两行） ──
const CARD_W = 200
const CARD_H = 48
const ICON_BLOCK = 32

type AppCardAttributes = Required<BaseNodeStyleProps> & {
  color: string
  isCenter: boolean
  name: string
  subText: string
  iconUri: string | null
  iconChar: string
  iconFill: string
  shared: boolean
}

class AppCardNode extends BaseNode {
  static type = 'app-card-node'

  protected drawKeyShape(attributes: AppCardAttributes, container: Group): DisplayObject | undefined {
    const { color, isCenter, name, subText, iconUri, iconChar, iconFill, shared } = attributes
    const textX = -CARD_W / 2 + 8 + ICON_BLOCK + 10
    const key = this.upsert('key', 'rect', {
      x: -CARD_W / 2,
      y: -CARD_H / 2,
      width: CARD_W,
      height: CARD_H,
      fill: '#ffffff',
      stroke: isCenter ? '#1677ff' : shared ? '#f77234' : color,
      lineWidth: isCenter ? 2 : 1.2,
      lineDash: shared ? [5, 3] : undefined,
      radius: 8,
      shadowColor: isCenter ? 'rgba(22, 119, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)',
      shadowBlur: isCenter ? 10 : 3,
    }, container)
    // 左侧类型图标块：品牌 SVG（资源）或类型首字（应用/外部）
    this.upsert('icon-block', 'rect', {
      x: -CARD_W / 2 + 8,
      y: -ICON_BLOCK / 2,
      width: ICON_BLOCK,
      height: ICON_BLOCK,
      fill: iconFill,
      radius: 6,
    }, container)
    if (iconUri) {
      this.upsert('icon-img', 'image', {
        x: -CARD_W / 2 + 8 + (ICON_BLOCK - 22) / 2,
        y: -11,
        width: 22,
        height: 22,
        src: iconUri,
      }, container)
    } else {
      this.upsert('icon-char', 'text', {
        text: iconChar,
        x: -CARD_W / 2 + 8 + ICON_BLOCK / 2,
        y: 0,
        fontSize: 13,
        fontWeight: 700,
        fill: color,
        textAlign: 'center',
        textBaseline: 'middle',
      }, container)
    }
    // 右侧两行：名称（粗）+ 副行（编码/分层，灰色）
    this.upsert('name-text', 'text', {
      text: name.length > 12 ? `${name.slice(0, 12)}…` : name,
      x: textX,
      y: -7,
      fontSize: 12,
      fontWeight: isCenter ? 700 : 600,
      fill: isCenter ? '#1677ff' : '#1d2129',
      textAlign: 'start',
      textBaseline: 'middle',
    }, container)
    this.upsert('sub-text', 'text', {
      text: subText.length > 16 ? `${subText.slice(0, 16)}…` : subText,
      x: textX,
      y: 11,
      fontSize: 10,
      fill: shared ? '#f77234' : '#86909c',
      textAlign: 'start',
      textBaseline: 'middle',
    }, container)
    return key
  }
}

register(ExtensionCategory.NODE, 'app-card-node', AppCardNode)

// ── 数据与渲染 ──
const loading = ref(false)
const topo = ref<IAppTopologyData | null>(null)
const chartRef = ref<HTMLElement>()
let graph: Graph | null = null

// 环境筛选：候选 = 标签定义 env 允许值；切换时带 ?env= 重拉拓扑
const envFilter = ref<string | undefined>()
const envOptions = ref<string[]>([])

function relCount(r: AppTopologyRelation): number {
  return topo.value?.edges.filter(e => e.relation === r).length ?? 0
}

const EDGE_META: Record<AppTopologyRelation, { stroke: string; dashed: boolean; label: string }> = {
  depends_on: { stroke: '#1677ff', dashed: false, label: '依赖' },
  depended_by: { stroke: '#52c41a', dashed: false, label: '被依赖' },
  external_dependency: { stroke: '#f6bd16', dashed: false, label: '外部依赖' },
  hosts_resource: { stroke: '#a9aeb8', dashed: false, label: '承载' },
  shared_resource: { stroke: '#f77234', dashed: true, label: '共享' },
}

function nodeSubText(n: IAppTopologyNode): string {
  if (n.type === 'app') return n.app_code || '应用'
  if (n.type === 'external') return '外部依赖'
  const parts = [n.layer ? (MODEL_LAYER_MAP[n.layer]?.text || n.layer) : '资源']
  if (n.env) parts.push(n.env)
  if (n.shared) parts.push('共享')
  return parts.join(' · ')
}

function nodeIcon(n: IAppTopologyNode): { uri: string | null; char: string; fill: string } {
  if (n.type === 'resource') {
    const uri = iconUriFor(n)
    if (uri) return { uri, char: '', fill: 'rgba(0, 0, 0, 0.03)' }
    return { uri: null, char: '资', fill: 'rgba(0, 0, 0, 0.05)' }
  }
  if (n.type === 'external') return { uri: null, char: '外', fill: 'rgba(246, 189, 22, 0.18)' }
  return { uri: null, char: '应', fill: 'rgba(22, 119, 255, 0.12)' }
}

function nodeColor(n: IAppTopologyNode): string {
  if (n.type === 'app') return '#1677ff'
  if (n.type === 'external') return '#f6bd16'
  return '#5b8ff9'
}

function toGraphData(topoData: IAppTopologyData) {
  return {
    nodes: topoData.nodes.map((n) => ({
      id: n.id,
      data: {
        info: n,
        color: nodeColor(n),
        isCenter: !!n.is_center,
        name: n.name,
        subText: nodeSubText(n),
        iconUri: nodeIcon(n).uri,
        iconChar: nodeIcon(n).char,
        iconFill: nodeIcon(n).fill,
        shared: !!n.shared,
      },
    })),
    edges: topoData.edges.map((e, idx) => {
      // 外部依赖反转为 external→app，使外部系统分层在顶部
      let source = e.source
      let target = e.target
      if (e.relation === 'external_dependency') {
        source = e.target
        target = e.source
      }
      return {
        id: `${e.relation}-${idx}`,
        source: String(source),
        target: String(target),
        data: { info: e },
      }
    }),
  }
}

function nodeTooltip(n: IAppTopologyNode): string {
  const lines = [`<b>${n.name}</b>`]
  if (n.type === 'app') {
    lines.push(`编码：${n.app_code || '-'}`, `负责人：${n.owner || '-'}`)
  } else if (n.type === 'external') {
    lines.push(`外部依赖${n.url ? `　${n.url}` : ''}`)
  } else {
    lines.push(
      `模型：${n.model_code || '-'}`,
      `分层：${n.layer ? (MODEL_LAYER_MAP[n.layer]?.text || n.layer) : '-'}`,
      `厂商：${n.provider || '-'}　环境：${n.env || '-'}`,
    )
    if (n.shared) lines.push('<span style="color:#f77234">⚠ 该资源被多个应用共享</span>')
  }
  return lines.join('<br/>')
}

function edgeTooltip(e: IAppTopologyEdge): string {
  return `${EDGE_META[e.relation].label}${e.note ? `：${e.note}` : ''}`
}

function renderGraph() {
  if (!chartRef.value || !topo.value) return
  graph?.destroy()
  graph = new Graph({
    container: chartRef.value,
    autoResize: true,
    autoFit: 'view',
    padding: 24,
    data: toGraphData(topo.value),
    node: {
      type: 'app-card-node',
      style: (d: NodeData) => {
        const data = d.data as {
          color: string; isCenter: boolean; name: string; subText: string
          iconUri: string | null; iconChar: string; iconFill: string; shared: boolean
        }
        return {
          size: [CARD_W, CARD_H],
          color: data.color,
          isCenter: data.isCenter,
          name: data.name,
          subText: data.subText,
          iconUri: data.iconUri,
          iconChar: data.iconChar,
          iconFill: data.iconFill,
          shared: data.shared,
          icon: false,
          label: false,
          badge: false,
        }
      },
      state: {
        active: { halo: true },
        dim: { fillOpacity: 0.15, strokeOpacity: 0.15, shadowBlur: 0 },
      },
    },
    edge: {
      style: (d: EdgeData) => {
        const { info } = d.data as { info: IAppTopologyEdge }
        const meta = EDGE_META[info.relation]
        return {
          stroke: meta.stroke,
          lineWidth: 1.4,
          lineDash: meta.dashed ? [5, 4] : undefined,
          labelText: meta.label,
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
    // BlueKing 式泳道：外部系统在顶、应用居中、承载资源在底（边方向已在 toGraphData 归一）
    layout: {
      type: 'antv-dagre',
      rankdir: 'TB',
      nodesep: 18,
      ranksep: 64,
      animation: true,
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      'drag-element',
      { type: 'hover-activate', degree: 1, direction: 'both', inactiveState: 'dim' },
    ],
    plugins: [{
      type: 'tooltip',
      key: 'app-topo-tooltip',
      getContent: async (event: IElementEvent, items: ElementDatum[]) => {
        const datum = items[0]
        if (!datum?.data) return ''
        if (event.targetType === 'node') return nodeTooltip((datum.data as { info: IAppTopologyNode }).info)
        return edgeTooltip((datum.data as { info: IAppTopologyEdge }).info)
      },
    }],
  })
  graph.render()
}

watch(() => props.visible, async (v) => {
  if (v && props.appId) {
    loading.value = true
    envFilter.value = undefined
    try {
      // 并发：拓扑（全部环境）+ 环境候选（标签定义 env 允许值，与流水线编辑器同源）
      const [topoRes, tagDefs] = await Promise.all([
        getAppTopology(props.appId),
        getTagDefinitions({ page: 1, page_size: 100 }).catch(() => null),
      ])
      topo.value = topoRes.data
      envOptions.value = tagDefs?.data.items.find(d => d.tag_key === 'env')?.allowed_values ?? []
      await nextTick()
      renderGraph()
    } catch { /* 拦截器已提示 */ } finally { loading.value = false }
  }
  if (!v) {
    graph?.destroy()
    graph = null
    topo.value = null
  }
})

// 切换环境：带 ?env= 重拉资源节点（应用/外部节点不受环境影响）
watch(envFilter, async () => {
  if (!props.visible || !props.appId) return
  loading.value = true
  try {
    topo.value = (await getAppTopology(props.appId, envFilter.value)).data
    await nextTick()
    renderGraph()
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
})
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.app-topo-chart {
  width: 100%;
  height: 640px;
  background: $bg-card;
  border: 1px solid $border-color-light;
  border-radius: $radius-md;
}
.topo-tip { margin: $spacing-xs 0 0; font-size: $font-size-xs; color: $text-secondary; }
</style>
