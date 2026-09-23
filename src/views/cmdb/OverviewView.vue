<template>
  <div class="asset-overview">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <a-space size="medium">
          <span class="panel-title">资产总览</span>
          <a-radio-group v-model="groupBy" type="button" size="small">
            <a-radio value="category">按分类</a-radio>
            <a-radio value="layer">按分层</a-radio>
          </a-radio-group>
        </a-space>
        <a-space size="medium">
          <span class="stat-item">资源 <b>{{ totalResources }}</b></span>
          <span class="stat-item">模型 <b>{{ allModels.length }}</b></span>
          <span class="stat-item">分类 <b>{{ overview.length }}</b></span>
          <a-button size="small" @click="router.push('/cmdb/resources')">查看全部资源</a-button>
          <a-button size="small" @click="fetchAll">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-spin :loading="loading" style="width: 100%">
        <a-row :gutter="16">
          <a-col v-for="g in displayGroups" :key="g.id" :span="8" style="margin-bottom: 16px">
            <div class="group-card">
              <div class="group-head">
                <span class="group-name">{{ g.name }}</span>
                <span class="group-total">{{ g.total }}</span>
              </div>
              <div class="model-list">
                <div
                  v-for="m in g.models"
                  :key="m.id"
                  class="model-row"
                  @click="router.push({ path: '/cmdb/resources', query: { model_id: String(m.id) } })"
                >
                  <span class="model-name-wrap">
                    <span class="model-name">{{ m.name }}</span>
                    <a-tag v-if="groupBy === 'category' && m.layer" size="small" :color="MODEL_LAYER_MAP[m.layer]?.color || 'gray'">{{ MODEL_LAYER_MAP[m.layer]?.text || m.layer }}</a-tag>
                  </span>
                  <span class="model-count" :class="{ 'model-count-zero': m.count === 0 }">{{ m.count }}</span>
                </div>
                <div v-if="!g.models.length" class="model-empty">该分类暂无模型</div>
              </div>
            </div>
          </a-col>
        </a-row>
        <a-empty v-if="!loading && !displayGroups.length" description="暂无模型，请先到「模型管理」创建" />
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { getModelsOverview } from '../../api/cmdb'
import type { IModelOverviewCategory } from '../../api/cmdb'
import { MODEL_LAYERS, MODEL_LAYER_MAP } from '../../types/model'

const router = useRouter()
const loading = ref(true)
// 后端聚合接口：分类→模型→存活资源数一次返回（单请求渲染整页）
const overview = ref<IModelOverviewCategory[]>([])

// 视图维度：分类分组（默认）/ 资产分层分组
const groupBy = ref<'category' | 'layer'>('category')

const allModels = computed(() => overview.value.flatMap(c => c.models))
const totalResources = computed(() => allModels.value.reduce((a, m) => a + m.resource_count, 0))

// 分类分组矩阵：分类 → 该组模型（含存活资源计数与分层标签）
const groups = computed(() => overview.value.map(cat => ({
  id: cat.id,
  name: cat.name,
  total: cat.models.reduce((a, m) => a + m.resource_count, 0),
  models: cat.models.map(m => ({ id: m.id, name: m.name, count: m.resource_count, layer: m.layer })),
})))

// 分层分组矩阵：按 MODEL_LAYERS 枚举序排列，未设置分层的归「未分层」放最后
const layerGroups = computed(() => {
  const buckets = new Map<string, { id: number; name: string; count: number; layer: string | null }[]>()
  for (const m of allModels.value) {
    const key = m.layer ?? '__none__'
    const list = buckets.get(key) ?? []
    list.push({ id: m.id, name: m.name, count: m.resource_count, layer: m.layer })
    buckets.set(key, list)
  }
  const result: { id: number; name: string; total: number; models: { id: number; name: string; count: number; layer: string | null }[] }[] = []
  let seq = 0
  for (const layer of MODEL_LAYERS) {
    const models = buckets.get(layer)
    if (!models?.length) continue
    result.push({
      id: -1 - seq++,
      name: MODEL_LAYER_MAP[layer]?.text || layer,
      total: models.reduce((a, m) => a + m.count, 0),
      models,
    })
  }
  const none = buckets.get('__none__')
  if (none?.length) {
    result.push({ id: -99, name: '未分层', total: none.reduce((a, m) => a + m.count, 0), models: none })
  }
  return result
})

const displayGroups = computed(() => (groupBy.value === 'layer' ? layerGroups.value : groups.value))

async function fetchAll() {
  loading.value = true
  try {
    overview.value = (await getModelsOverview()).data
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

onMounted(fetchAll)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
.stat-item { font-size: $font-size-sm; color: $text-secondary;
  b { color: $color-primary; font-size: $font-size-base; margin: 0 2px; }
}

.group-card {
  background: $bg-card; border: 1px solid $border-color-light; border-radius: $radius-md;
  overflow: hidden; height: 100%;
  transition: border-color 0.2s;
  &:hover { border-color: $color-primary; }
}
.group-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: $spacing-sm $spacing-md;
  background: rgba(22, 119, 255, 0.04);
  border-bottom: 1px solid $border-color-light;
}
.group-name { font-weight: 600; color: $text-primary; }
.group-total { font-size: $font-size-sm; color: $color-primary; font-weight: 600; }
.model-list { padding: $spacing-xs $spacing-sm; max-height: 320px; overflow-y: auto; }
.model-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px $spacing-xs; border-radius: $radius-sm;
  cursor: pointer; transition: background 0.15s;
  &:hover { background: rgba(22, 119, 255, 0.06); .model-name { color: $color-primary; } }
}
.model-name { color: $text-primary; font-size: $font-size-sm; }
.model-name-wrap {
  display: flex; align-items: center; gap: 4px;
  min-width: 0;
  .model-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.model-count {
  font-size: $font-size-xs; color: $color-primary; font-weight: 600;
  background: rgba(22, 119, 255, 0.08); border-radius: 10px; padding: 0 8px; min-width: 20px; text-align: center;
}
.model-count-zero { color: $text-disabled; background: rgba(0, 0, 0, 0.04); }
.model-empty { padding: $spacing-sm 0; text-align: center; font-size: $font-size-xs; color: $text-disabled; }
</style>
