<template>
  <div class="tag-management">
    <a-card :bordered="false" class="list-card">
      <div class="filter-bar">
        <span class="panel-title">标签定义管理</span>
        <a-space>
          <a-input-search v-model="filterCategory" placeholder="按分类筛选" allow-clear style="width: 180px" @search="handleSearch" />
          <a-button type="primary" @click="handleAdd">
            <template #icon><icon-plus /></template>新增标签
          </a-button>
        </a-space>
      </div>
      <a-table
        :data="tagDefs"
        :loading="loading"
        :columns="columns"
        :pagination="pagination"
        row-key="id"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      >
        <template #tag_key="{ record }"><a-tag size="small" color="arcoblue">{{ record.tag_key }}</a-tag></template>
        <template #value_type="{ record }"><a-tag size="small">{{ record.value_type }}</a-tag></template>
        <template #editable="{ record }">
          <a-tag :size="'small'" :color="record.editable ? 'green' : 'red'">{{ record.editable ? '可编辑' : '只读' }}</a-tag>
        </template>
        <template #allowed_values="{ record }">
          <a-space v-if="record.allowed_values?.length" wrap>
            <a-tag v-for="v in record.allowed_values" :key="v" size="small">{{ v }}</a-tag>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #actions="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleEdit(record)"><template #icon><icon-edit /></template></a-button>
            <a-popconfirm content="确定删除该标签定义？" @ok="handleDelete(record.id)">
              <a-button type="text" size="small" status="danger"><template #icon><icon-delete /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:visible="formVisible" :title="editingId ? '编辑标签' : '新增标签'" :width="520" :ok-loading="formLoading" @ok="handleSubmit">
      <a-form :model="formData" :rules="formRules" layout="vertical" ref="formRef">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="tag_key" label="Key"><a-input v-model="formData.tag_key" placeholder="如：env" :disabled="!!editingId" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item field="name" label="显示名称"><a-input v-model="formData.name" placeholder="如：环境" /></a-form-item></a-col>
        </a-row>
        <a-form-item field="description" label="描述"><a-input v-model="formData.description" placeholder="可选" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item field="category" label="分类"><a-input v-model="formData.category" placeholder="如：系统、业务" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item field="value_type" label="值类型">
              <a-select v-model="formData.value_type">
                <a-option value="string">文本</a-option>
                <a-option value="number">数字</a-option>
                <a-option value="boolean">布尔</a-option>
                <a-option value="enum">枚举</a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item field="allowed_values" label="允许值（逗号分隔）">
          <a-input v-model="allowedValuesText" placeholder="如：dev,staging,production" />
        </a-form-item>
        <a-form-item field="editable" label="可编辑"><a-switch v-model="formData.editable" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconEdit, IconDelete } from '@arco-design/web-vue/es/icon'
import * as tagApi from '../../api/tag'
import type { ITagDefinition } from '../../api/tag'

const loading = ref(false)
const tagDefs = ref<ITagDefinition[]>([])
const filterCategory = ref('')
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showTotal: true, showPageSize: true })
const columns = [
  { title: 'Key', slotName: 'tag_key', width: 140 },
  { title: '名称', dataIndex: 'name', width: 120 },
  { title: '分类', dataIndex: 'category', width: 100 },
  { title: '值类型', slotName: 'value_type', width: 90 },
  { title: '可编辑', slotName: 'editable', width: 90 },
  { title: '允许值', slotName: 'allowed_values' },
  { title: '操作', slotName: 'actions', width: 100 },
]

async function fetchData() {
  loading.value = true
  try {
    const res = await tagApi.getTagDefinitions({ category: filterCategory.value || undefined, page: pagination.current, page_size: pagination.pageSize })
    tagDefs.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { Message.error('获取标签列表失败') } finally { loading.value = false }
}

function handleSearch() { pagination.current = 1; fetchData() }
function onPageChange(page: number) { pagination.current = page; fetchData() }
function onPageSizeChange(size: number) { pagination.pageSize = size; pagination.current = 1; fetchData() }

const formVisible = ref(false)
const formLoading = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const allowedValuesText = ref('')
const formData = reactive({ tag_key: '', name: '', description: '', category: '', value_type: 'string', editable: true })
const formRules = { tag_key: [{ required: true, message: '请输入 Key' }], name: [{ required: true, message: '请输入名称' }] }

function handleAdd() {
  editingId.value = null
  Object.assign(formData, { tag_key: '', name: '', description: '', category: '', value_type: 'string', editable: true })
  allowedValuesText.value = ''
  formVisible.value = true
}

function handleEdit(record: ITagDefinition) {
  editingId.value = record.id
  Object.assign(formData, { tag_key: record.tag_key, name: record.name, description: record.description || '', category: record.category || '', value_type: record.value_type, editable: record.editable })
  allowedValuesText.value = record.allowed_values?.join(',') || ''
  formVisible.value = true
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  formLoading.value = true
  const allowedValues = allowedValuesText.value.trim() ? allowedValuesText.value.split(',').map(s => s.trim()).filter(Boolean) : undefined
  try {
    if (editingId.value) {
      await tagApi.updateTagDefinition(editingId.value, { name: formData.name, description: formData.description || undefined, category: formData.category || undefined, value_type: formData.value_type, allowed_values: allowedValues, editable: formData.editable })
    } else {
      await tagApi.createTagDefinition({ tag_key: formData.tag_key, name: formData.name, description: formData.description || undefined, category: formData.category || undefined, value_type: formData.value_type, allowed_values: allowedValues, editable: formData.editable })
    }
    Message.success(editingId.value ? '编辑成功' : '新增成功')
    formVisible.value = false
    fetchData()
  } catch { Message.error('操作失败') } finally { formLoading.value = false }
}

async function handleDelete(id: number) {
  try { await tagApi.deleteTagDefinition(id); Message.success('删除成功'); fetchData() } catch { Message.error('删除失败') }
}

onMounted(() => fetchData())
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;
.tag-management { width: 100%; }
.list-card { background: $bg-card; border: 1px solid $border-color-light; }
.filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: $spacing-md; }
.panel-title { font-size: $font-size-lg; font-weight: 600; color: $text-primary; }
</style>
