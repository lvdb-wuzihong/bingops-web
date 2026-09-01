<template>
  <div class="tag-view">
    <div class="section-header">
      <h4>资源标签</h4>
      <a-button type="primary" size="small" @click="showAddModal = true">
        <template #icon><icon-plus /></template>添加标签
      </a-button>
    </div>
    <div v-if="loading" class="loading-wrap"><a-spin /></div>
    <div v-else-if="tags.length > 0" class="tags-grid">
      <div v-for="tag in tags" :key="`${tag.tag_key}_${tag.source}`" class="tag-item">
        <a-tag :color="sourceColor(tag.source)" size="medium" closable @close="handleRemove(tag)">
          <span class="tag-key">{{ tag.tag_key }}</span>
          <span class="tag-value">: {{ tag.tag_value }}</span>
          <span class="tag-source">({{ sourceText(tag.source) }})</span>
        </a-tag>
      </div>
    </div>
    <a-empty v-else description="暂无标签" />

    <a-modal v-model:visible="showAddModal" title="添加标签" :width="420" :ok-loading="addLoading" @ok="handleAdd">
      <a-form :model="addForm" layout="vertical">
        <a-form-item label="标签 Key">
          <a-input v-model="addForm.tag_key" placeholder="如：env" />
        </a-form-item>
        <a-form-item label="标签值">
          <a-input v-model="addForm.tag_value" placeholder="如：production" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus } from '@arco-design/web-vue/es/icon'
import * as tagApi from '../../../api/tag'
import type { IResourceTag } from '../../../api/tag'

const props = defineProps<{ resourceId: number }>()

const loading = ref(false)
const tags = ref<IResourceTag[]>([])

function sourceColor(source: string) { return source === 'cloud' ? 'green' : source === 'rule' ? 'orange' : 'blue' }
function sourceText(source: string) { return source === 'cloud' ? '云同步' : source === 'rule' ? '规则' : '手动' }

async function fetchTags() {
  loading.value = true
  try { const res = await tagApi.getResourceTags(props.resourceId); tags.value = res.data } catch { /* ignore */ } finally { loading.value = false }
}

const showAddModal = ref(false)
const addLoading = ref(false)
const addForm = reactive({ tag_key: '', tag_value: '' })

async function handleAdd() {
  if (!addForm.tag_key || !addForm.tag_value) { Message.warning('请填写完整'); return }
  addLoading.value = true
  try {
    await tagApi.addResourceTag({ resource_id: props.resourceId, tag_key: addForm.tag_key, tag_value: addForm.tag_value })
    Message.success('添加成功')
    showAddModal.value = false
    addForm.tag_key = ''
    addForm.tag_value = ''
    fetchTags()
  } catch { Message.error('添加失败') } finally { addLoading.value = false }
}

async function handleRemove(tag: IResourceTag) {
  try { await tagApi.removeResourceTag(props.resourceId, tag.tag_key, tag.source); Message.success('移除成功'); fetchTags() } catch { Message.error('移除失败') }
}

onMounted(() => fetchTags())

// 点击关联资源跳转（路由参数变化组件复用）时重拉
watch(() => props.resourceId, () => fetchTags())
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;
.tag-view { display: flex; flex-direction: column; gap: $spacing-md; }
.section-header { display: flex; justify-content: space-between; align-items: center; h4 { margin: 0; font-size: $font-size-base; color: $text-primary; } }
.tags-grid { display: flex; flex-wrap: wrap; gap: $spacing-sm; }
.tag-key { font-weight: 600; }
.tag-source { font-size: 11px; opacity: 0.7; margin-left: 4px; }
.loading-wrap { text-align: center; padding: $spacing-lg; }
</style>
