<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div v-for="item in statItems" :key="item.key" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-info">
            <span class="stat-label">{{ item.label }}</span>
            <span class="stat-value">{{ item.value }}</span>
          </div>
          <div class="stat-icon" :style="{ background: item.gradient }">
            <component :is="item.icon" />
          </div>
        </div>
        <div class="stat-footer">
          <span class="stat-trend" :class="item.trendClass">
            {{ item.trendText }}
          </span>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-row">
      <a-card title="资源趋势" class="chart-card chart-card-wide">
        <div ref="trendChartRef" class="chart-container"></div>
      </a-card>
      <a-card title="资产类型分布" class="chart-card">
        <div ref="typeChartRef" class="chart-container"></div>
      </a-card>
    </div>

    <!-- 最近动态 -->
    <div class="activity-row">
      <a-card title="最近告警" class="activity-card">
        <a-table
          :data="recentAlerts"
          :columns="alertColumns"
          :pagination="false"
          :bordered="false"
          size="small"
        >
          <template #level="{ record }">
            <a-tag :color="record.level === 'critical' ? 'red' : record.level === 'warning' ? 'orange' : 'blue'" size="small">
              {{ record.levelText }}
            </a-tag>
          </template>
        </a-table>
      </a-card>
      <a-card title="最近操作" class="activity-card">
        <a-timeline>
          <a-timeline-item v-for="(act, idx) in recentActions" :key="idx" :label="act.time">
            <span class="action-text">{{ act.content }}</span>
          </a-timeline-item>
        </a-timeline>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, markRaw } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import {
  IconDesktop,
  IconExclamation,
  IconCloudDownload,
  IconFile,
} from '@arco-design/web-vue/es/icon'

use([CanvasRenderer, LineChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const trendChartRef = ref<HTMLElement>()
const typeChartRef = ref<HTMLElement>()

// Mock 统计数据
const stats = ref({
  totalServers: 256,
  onlineServers: 241,
  offlineServers: 15,
  alertCount: 8,
  deployCount: 42,
  ticketCount: 17,
})

const statItems = computed(() => [
  {
    key: 'total',
    label: '服务器总数',
    value: stats.value.totalServers,
    icon: markRaw(IconDesktop),
    gradient: 'linear-gradient(135deg, #1677ff, #4096ff)',
    trendText: '+12 本月新增',
    trendClass: 'trend-up',
  },
  {
    key: 'online',
    label: '在线服务器',
    value: stats.value.onlineServers,
    icon: markRaw(IconDesktop),
    gradient: 'linear-gradient(135deg, #52c41a, #389e0d)',
    trendText: '94.1% 在线率',
    trendClass: 'trend-good',
  },
  {
    key: 'alert',
    label: '活跃告警',
    value: stats.value.alertCount,
    icon: markRaw(IconExclamation),
    gradient: 'linear-gradient(135deg, #ff5252, #ff1744)',
    trendText: '-3 较昨日',
    trendClass: 'trend-down',
  },
  {
    key: 'deploy',
    label: '本月部署',
    value: stats.value.deployCount,
    icon: markRaw(IconCloudDownload),
    gradient: 'linear-gradient(135deg, #2f54eb, #597ef7)',
    trendText: '+8 较上月',
    trendClass: 'trend-up',
  },
  {
    key: 'ticket',
    label: '待处理工单',
    value: stats.value.ticketCount,
    icon: markRaw(IconFile),
    gradient: 'linear-gradient(135deg, #faad14, #d48806)',
    trendText: '5 个紧急',
    trendClass: 'trend-warn',
  },
])

// Mock 告警数据
const recentAlerts = ref([
  { id: '1', host: 'web-prod-03', level: 'critical', levelText: '严重', message: 'CPU 使用率 > 95%', time: '10 分钟前' },
  { id: '2', host: 'db-master-01', level: 'warning', levelText: '警告', message: '磁盘使用率 > 85%', time: '30 分钟前' },
  { id: '3', host: 'cache-02', level: 'warning', levelText: '警告', message: '内存使用率 > 80%', time: '1 小时前' },
  { id: '4', host: 'api-gateway-01', level: 'info', levelText: '信息', message: '服务重启成功', time: '2 小时前' },
])

const alertColumns = [
  { title: '主机', dataIndex: 'host' },
  { title: '级别', slotName: 'level', width: 80 },
  { title: '信息', dataIndex: 'message' },
  { title: '时间', dataIndex: 'time', width: 100 },
]

// Mock 操作记录
const recentActions = ref([
  { content: '部署 web-app v2.3.1 到生产环境', time: '14:30' },
  { content: '新增服务器 k8s-node-05', time: '13:15' },
  { content: '处理告警: db-slave-02 主从同步延迟', time: '11:40' },
  { content: '审批通过: 测试环境扩容申请', time: '10:20' },
  { content: '更新防火墙规则', time: '09:00' },
])

// 初始化图表
function initTrendChart() {
  if (!trendChartRef.value) return
  const chart = echarts.init(trendChartRef.value)
  const days = ['07-10', '07-11', '07-12', '07-13', '07-14', '07-15', '07-16']
  chart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#d6e4ff' } }, axisLabel: { color: '#597ef7' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#e6f0ff' } }, axisLabel: { color: '#597ef7' } },
    series: [
      {
        name: 'CPU 平均使用率',
        type: 'line',
        smooth: true,
        data: [45, 52, 48, 61, 55, 49, 53],
        lineStyle: { color: '#1677ff', width: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(22,119,255,0.2)' }, { offset: 1, color: 'rgba(22,119,255,0)' }]) },
        itemStyle: { color: '#1677ff' },
      },
      {
        name: '内存平均使用率',
        type: 'line',
        smooth: true,
        data: [62, 65, 63, 68, 66, 64, 67],
        lineStyle: { color: '#2f54eb', width: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(47,84,235,0.15)' }, { offset: 1, color: 'rgba(47,84,235,0)' }]) },
        itemStyle: { color: '#2f54eb' },
      },
    ],
  })
  window.addEventListener('resize', () => chart.resize())
}

function initTypeChart() {
  if (!typeChartRef.value) return
  const chart = echarts.init(typeChartRef.value)
  chart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#ffffff', borderColor: '#d6e4ff', textStyle: { color: '#1d39c4' } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#ffffff', borderWidth: 2 },
        label: { color: '#597ef7', fontSize: 12 },
        data: [
          { value: 120, name: 'Web 服务器', itemStyle: { color: '#1677ff' } },
          { value: 48, name: '数据库', itemStyle: { color: '#2f54eb' } },
          { value: 36, name: '缓存', itemStyle: { color: '#4096ff' } },
          { value: 28, name: '网关', itemStyle: { color: '#52c41a' } },
          { value: 24, name: '其他', itemStyle: { color: '#faad14' } },
        ],
      },
    ],
  })
  window.addEventListener('resize', () => chart.resize())
}

onMounted(() => {
  initTrendChart()
  initTypeChart()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.dashboard {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: $spacing-md;

  @media (max-width: 1440px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 1280px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: $spacing-lg;
  backdrop-filter: blur(12px);
  transition: all $transition-base;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, $color-primary, transparent);
    opacity: 0;
    transition: opacity $transition-base;
  }

  &:hover {
    border-color: $border-glow;
    box-shadow: $shadow-glow;

    &::before {
      opacity: 1;
    }
  }
}

.stat-card-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.stat-label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  font-family: $font-mono;
  color: $text-primary;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: $radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: white;
}

.stat-footer {
  margin-top: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color-light;
}

.stat-trend {
  font-size: $font-size-xs;

  &.trend-up { color: $color-success; }
  &.trend-down { color: $color-success; }
  &.trend-good { color: $color-primary; }
  &.trend-warn { color: $color-warning; }
}

.chart-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: $spacing-md;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  background: $bg-card;
  border: 1px solid $border-color;
  backdrop-filter: blur(12px);
}

.chart-container {
  height: 280px;
}

.activity-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
}

.activity-card {
  background: $bg-card;
  border: 1px solid $border-color;
  backdrop-filter: blur(12px);
}

.action-text {
  color: $text-secondary;
  font-size: $font-size-sm;
}
</style>
