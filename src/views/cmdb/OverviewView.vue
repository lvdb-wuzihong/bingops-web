<template>
  <div class="asset-overview">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">资产总览</span>
        <a-space size="medium">
          <span class="stat-item">资源 <b>{{ totalResources }}</b></span>
          <span class="stat-item">模型 <b>{{ models.length }}</b></span>
          <span class="stat-item">分类 <b>{{ categories.length }}</b></span>
          <a-button size="small" @click="router.push('/cmdb/resources')">查看全部资源</a-button>
          <a-button size="small" @click="fetchAll">
            <template #icon><icon-refresh /></template>
          </a-button>
        </a-space>
      </div>

      <a-spin :loading="loading" style="width: 100%">
        <a-row :gutter="16">
          <a-col v-for="g in groups" :key="g.id" :span="8" style="margin-bottom: 16px">
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
                  <span class="model-name">{{ m.name }}</span>
                  <span class="model-count" :class="{ 'model-count-zero': m.count === 0 }">{{ m.count }}</span>
                </div>
                <div v-if="!g.models.length" class="model-empty">该分类暂无模型</div>
              </div>
            </div>
          </a-col>
        </a-row>
        <a-empty v-if="!loading && !groups.length" description="暂无模型，请先到「模型管理」创建" />
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IconRefresh } from '@arco-design/web-vue/es/icon'
import { getResourceStats } from '../../api/cmdb'
import { getModelCategories, getModels } from '../../api/model'
import type { IModel, IModelCategory } from '../../types/model'

const router = useRouter()
const loading = ref(true)
const categories = ref<IModelCategory[]>([])
const models = ref<IModel[]>([])
// 模型实例计数：key 为 model_id 字符串（与 stats.by_model 一致）
const byModel = ref<Record<string, number>>({})

const totalResources = computed(() => Object.values(byModel.value).reduce((a, b) => a + b, 0))

// 分类分组矩阵：分类 → 该组模型（含实例计数）；未归属任何分类的模型兜底进「其他」
const groups = computed(() => {
  const known = new Set(categories.value.map(c => c.id))
  const result = categories.value.map(cat => {
    const ms = models.value.filter(m => m.category_id === cat.id)
    return {
      id: cat.id,
      name: cat.name,
      total: ms.reduce((acc, m) => acc + (byModel.value[String(m.id)] ?? 0), 0),
      models: ms.map(m => ({ id: m.id, name: m.name, count: byModel.value[String(m.id)] ?? 0 })),
    }
  })
  const orphan = models.value.filter(m => !known.has(m.category_id))
  if (orphan.length) {
    result.push({
      id: -1,
      name: '其他',
      total: orphan.reduce((acc, m) => acc + (byModel.value[String(m.id)] ?? 0), 0),
      models: orphan.map(m => ({ id: m.id, name: m.name, count: byModel.value[String(m.id)] ?? 0 })),
    })
  }
  return result
})

async function fetchAll() {
  loading.value = true
  try {
    const [cats, ms, stats] = await Promise.all([
      getModelCategories(),
      getModels(),
      getResourceStats(),
    ])
    categories.value = cats.data
    models.value = ms.data
    byModel.value = stats.data.by_model ?? {}
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
.model-count {
  font-size: $font-size-xs; color: $color-primary; font-weight: 600;
  background: rgba(22, 119, 255, 0.08); border-radius: 10px; padding: 0 8px; min-width: 20px; text-align: center;
}
.model-count-zero { color: $text-disabled; background: rgba(0, 0, 0, 0.04); }
.model-empty { padding: $spacing-sm 0; text-align: center; font-size: $font-size-xs; color: $text-disabled; }
</style>
