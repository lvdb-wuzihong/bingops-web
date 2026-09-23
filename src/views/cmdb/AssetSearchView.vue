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
          placeholder="搜索资产：名称 / IP / 实例 ID / 主机名 / 应用"
          size="large"
          allow-clear
          search-button
          @search="doSearch"
        />
        <a-checkbox v-model="exact" @change="onExactChange">精确匹配</a-checkbox>
      </div>
    </a-card>

    <a-spin :loading="loading" style="width: 100%">
      <a-empty v-if="!keyword" description="输入关键词搜索资产与应用" class="search-empty" />
      <a-empty v-else-if="!result" description="无匹配结果" class="search-empty" />
      <a-card v-else :bordered="false" class="result-card">
        <a-tabs v-model:active-key="activeGroup">
          <a-tab-pane key="resources" :title="`资源（${result.resources.length}）`">
            <div class="group-layout">
              <div class="group-list">
                <div
                  v-for="r in result.resources"
                  :key="r.id"
                  class="result-item"
                  :class="{ active: selectedType === 'resource' && selectedResourceId === r.id }"
                  @click="selectResource(r)"
                >
                  <div class="result-name">{{ r.name }}</div>
                  <div class="result-meta">
                    {{ r.model_code || '未知模型' }}
                    <template v-if="r.provider"> · {{ r.provider }}</template>
                    <template v-if="r.region"> · {{ r.region }}</template>
                  </div>
                </div>
                <div v-if="!result.resources.length" class="group-empty">无匹配资源</div>
              </div>
              <a-card :bordered="false" class="detail-panel">
                <template v-if="selectedResource">
                  <div class="detail-title">{{ selectedResource.name }}</div>
                  <a-descriptions :column="1" size="medium" class="detail-desc">
                    <a-descriptions-item label="模型">{{ selectedResource.model_code || '-' }}</a-descriptions-item>
                    <a-descriptions-item label="云厂商">{{ selectedResource.provider || '-' }}</a-descriptions-item>
                    <a-descriptions-item label="区域">{{ selectedResource.region || '-' }}</a-descriptions-item>
                    <a-descriptions-item label="状态">
                      <a-tag size="small" :color="statusMeta(selectedResource.status).color">{{ statusMeta(selectedResource.status).text }}</a-tag>
                    </a-descriptions-item>
                  </a-descriptions>
                  <a-button type="primary" long @click="router.push({ name: 'ResourceDetail', params: { id: String(selectedResource.id) } })">
                    <template #icon><icon-eye /></template>打开资源详情
                  </a-button>
                </template>
                <a-empty v-else description="点击左侧结果查看摘要" />
              </a-card>
            </div>
            <p v-if="result.resources.length >= searchLimit" class="group-tip">仅展示前 {{ searchLimit }} 条命中，更多请到「资源列表」按模型筛选</p>
          </a-tab-pane>

          <a-tab-pane key="apps" :title="`应用（${result.apps.length}）`">
            <div class="group-layout">
              <div class="group-list">
                <div
                  v-for="a in result.apps"
                  :key="a.id"
                  class="result-item"
                  :class="{ active: selectedType === 'app' && selectedAppId === a.id }"
                  @click="selectApp(a)"
                >
                  <div class="result-name">{{ a.name }}</div>
                  <div class="result-meta">
                    {{ a.app_code }}
                    <template v-if="a.owner"> · 负责人 {{ a.owner }}</template>
                    <template v-if="a.team"> · {{ a.team }}</template>
                  </div>
                </div>
                <div v-if="!result.apps.length" class="group-empty">无匹配应用</div>
              </div>
              <a-card :bordered="false" class="detail-panel">
                <template v-if="selectedApp">
                  <div class="detail-title">{{ selectedApp.name }}</div>
                  <a-descriptions :column="1" size="medium" class="detail-desc">
                    <a-descriptions-item label="应用编码">
                      <a-tag size="small" color="arcoblue">{{ selectedApp.app_code }}</a-tag>
                    </a-descriptions-item>
                    <a-descriptions-item label="负责人">{{ selectedApp.owner || '-' }}</a-descriptions-item>
                    <a-descriptions-item label="团队">{{ selectedApp.team || '-' }}</a-descriptions-item>
                  </a-descriptions>
                  <a-button long @click="router.push('/cmdb/apps')">
                    <template #icon><icon-apps /></template>前往业务应用
                  </a-button>
                </template>
                <a-empty v-else description="点击左侧结果查看摘要" />
              </a-card>
            </div>
            <p v-if="result.apps.length >= searchLimit" class="group-tip">仅展示前 {{ searchLimit }} 条命中，更多请到「业务应用」页搜索</p>
          </a-tab-pane>
        </a-tabs>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconLeft, IconEye, IconApps } from '@arco-design/web-vue/es/icon'
import { globalSearch } from '../../api/cmdb'
import type { IGlobalSearchResult, ISearchApp, ISearchResource } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()

const keywordInput = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const keyword = ref('')
const exact = ref(route.query.exact === '1')
const loading = ref(false)
const result = ref<IGlobalSearchResult | null>(null)
const activeGroup = ref<'resources' | 'apps'>('resources')
const selectedType = ref<'resource' | 'app' | null>(null)
const selectedResourceId = ref<number | null>(null)
const selectedAppId = ref<number | null>(null)
const selectedResource = ref<ISearchResource | null>(null)
const selectedApp = ref<ISearchApp | null>(null)
// 后端每分组上限 50，默认 20；「更多走对应域列表页」是后端语义
const searchLimit = 20

function selectResource(r: ISearchResource) {
  selectedType.value = 'resource'
  selectedResourceId.value = r.id
  selectedResource.value = r
}

function selectApp(a: ISearchApp) {
  selectedType.value = 'app'
  selectedAppId.value = a.id
  selectedApp.value = a
}

async function doSearch(v?: string | number | boolean) {
  const kw = String(v ?? keywordInput.value).trim()
  if (!kw) return
  keyword.value = kw
  keywordInput.value = kw
  // 同步 URL（可刷新/分享）；exact 参与回显
  router.replace({ query: { keyword: kw, ...(exact.value ? { exact: '1' } : {}) } })
  loading.value = true
  result.value = null
  selectedType.value = null
  selectedResource.value = null
  selectedApp.value = null
  try {
    result.value = (await globalSearch({ q: kw, exact: exact.value, limit: searchLimit })).data
    // 默认激活有命中的分组（资源优先，与工作台心智一致）
    activeGroup.value = result.value.resources.length ? 'resources' : 'apps'
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function onExactChange() {
  if (keyword.value) doSearch()
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
.search-bar {
  display: flex;
  gap: $spacing-md;
  align-items: center;

  .arco-input-wrapper { flex: 1; }
}
.search-empty { margin: 48px 0; }

.group-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: $spacing-md;
  align-items: start;
}

.group-list {
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
.group-empty { padding: 16px 0; text-align: center; color: $text-secondary; font-size: $font-size-sm; }
.group-tip { margin-top: $spacing-sm; font-size: $font-size-xs; color: $text-secondary; }

.detail-panel { position: sticky; top: 16px; }
.detail-title { font-size: $font-size-base; font-weight: 600; color: $text-primary; margin-bottom: $spacing-sm; }
.detail-desc { margin-bottom: $spacing-md; }
</style>
