<template>
  <div class="asset-search">
    <!-- 顶部搜索条 -->
    <a-card :bordered="false" class="search-bar-card">
      <div class="search-bar">
        <a-button size="large" @click="router.push('/dashboard')">
          <template #icon><icon-left /></template>返回
        </a-button>
        <a-input-search
          v-model="keywordInput"
          placeholder="搜索资产：名称 / IP / 实例 ID / 业务 / 负责人"
          size="large"
          allow-clear
          search-button
          @search="doSearch"
        />
      </div>
    </a-card>

    <a-spin :loading="loading" style="width: 100%">
      <a-empty v-if="!keyword" description="输入关键词搜索资产" class="search-empty" />
      <a-empty v-else-if="!results.length" description="无匹配资产" class="search-empty" />
      <div v-else class="result-layout">
        <!-- 左：结果列表 -->
        <a-card :bordered="false" class="result-card">
          <div class="result-count">共 {{ results.length }} 条匹配结果</div>
          <div class="result-list">
            <div
              v-for="r in pageItems"
              :key="r.id"
              class="result-item"
              :class="{ active: selected?.id === r.id }"
              @click="selected = r"
            >
              <div class="result-name">{{ r.name }}</div>
              <div class="result-meta">
                {{ r.model_code || '未知模型' }}
                <template v-if="r.provider_id"> · {{ r.provider_id }}</template>
                <template v-if="r.provider"> · {{ r.provider }}</template>
              </div>
            </div>
          </div>
          <div class="result-pager">
            <a-pagination v-model:current="page" :page-size="PAGE_SIZE" :total="results.length" simple show-total />
          </div>
        </a-card>

        <!-- 右：属性摘要 -->
        <a-card :bordered="false" class="detail-card">
          <template v-if="selected">
            <div class="detail-title">{{ selected.name }}</div>
            <a-descriptions :column="1" size="medium" class="detail-desc">
              <a-descriptions-item label="模型">{{ selected.model_code || '-' }}</a-descriptions-item>
              <a-descriptions-item label="云厂商">{{ selected.provider || '-' }}</a-descriptions-item>
              <a-descriptions-item label="区域">{{ selected.region || '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态">
                <a-tag size="small" :color="statusMeta(selected.status).color">{{ statusMeta(selected.status).text }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="实例 ID">{{ selected.provider_id || '-' }}</a-descriptions-item>
              <a-descriptions-item v-if="selected.labels && Object.keys(selected.labels).length" label="标签">
                <a-space wrap size="mini">
                  <a-tag v-for="(v, k) in selected.labels" :key="k" size="small">{{ k }}: {{ v }}</a-tag>
                </a-space>
              </a-descriptions-item>
            </a-descriptions>
            <a-button type="primary" long @click="openDetail(selected.id)">
              <template #icon><icon-eye /></template>打开资源详情
            </a-button>
          </template>
          <a-empty v-else description="点击左侧结果查看摘要" />
        </a-card>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconLeft, IconEye } from '@arco-design/web-vue/es/icon'
import { getResourceOptions } from '../../api/cmdb'
import type { IResourceOption } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()

const keywordInput = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const keyword = ref('')
const loading = ref(false)
const results = ref<IResourceOption[]>([])
const selected = ref<IResourceOption | null>(null)
const page = ref(1)
// 结果集来自 options 轻量接口（keyword 覆盖 name/IP/labels/fields），前端切片分页
const PAGE_SIZE = 20

const pageItems = computed(() => results.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

async function doSearch(v?: string | number | boolean) {
  const kw = String(v ?? keywordInput.value).trim()
  if (!kw) return
  keyword.value = kw
  keywordInput.value = kw
  // 同步 URL（可刷新/分享），replace 不产生历史记录
  router.replace({ query: { keyword: kw } })
  loading.value = true
  selected.value = null
  page.value = 1
  try {
    results.value = (await getResourceOptions({ keyword: kw, limit: 200 })).data
    if (results.value.length) selected.value = results.value[0]
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function openDetail(id: number) {
  router.push({ name: 'ResourceDetail', params: { id: String(id) } })
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  running: { text: '运行中', color: 'green' },
  ready: { text: '就绪', color: 'green' },
  not_ready: { text: '未就绪', color: 'red' },
  stopped: { text: '已停止', color: 'red' },
  pending: { text: '启动中', color: 'orange' },
  failed: { text: '异常', color: 'red' },
  succeeded: { text: '已完成', color: 'blue' },
  maintenance: { text: '维护中', color: 'orange' },
  unknown: { text: '未知', color: 'gray' },
}

function statusMeta(s: string | null) {
  if (!s) return { text: '无状态', color: 'gray' }
  return STATUS_MAP[s] || { text: s, color: 'gray' }
}

// 深链进入：/cmdb/search?keyword=xx 自动执行搜索
onMounted(() => {
  if (keywordInput.value) doSearch()
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.search-bar-card { margin-bottom: $spacing-md; }
.search-bar { display: flex; gap: $spacing-sm; align-items: center; }
.search-empty { margin: 48px 0; }

.result-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: $spacing-md;
  align-items: start;
}

.result-count { font-size: $font-size-sm; color: $text-secondary; margin-bottom: $spacing-sm; }

.result-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 60vh;
  overflow-y: auto;
}

.result-item {
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: $radius-md;
  cursor: pointer;

  &:hover { background: rgba(22, 119, 255, 0.04); }
  &.active { background: rgba(22, 119, 255, 0.08); border-color: rgba(22, 119, 255, 0.3); }
}

.result-name { font-weight: 500; color: $text-primary; }
.result-meta { font-size: $font-size-xs; color: $text-secondary; margin-top: 2px; }
.result-pager { margin-top: $spacing-sm; display: flex; justify-content: flex-end; }

.detail-card { position: sticky; top: 16px; }
.detail-title { font-size: $font-size-base; font-weight: 600; color: $text-primary; margin-bottom: $spacing-sm; }
.detail-desc { margin-bottom: $spacing-md; }
</style>
