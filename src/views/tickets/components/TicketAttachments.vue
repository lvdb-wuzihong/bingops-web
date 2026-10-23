<template>
  <div class="ticket-attachments">
    <div class="att-head">
      <span class="section-title">
        附件
        <span v-if="items.length" class="att-count">{{ items.length }}</span>
      </span>
      <a-upload
        v-if="canWrite"
        :accept="ATTACHMENT_ACCEPT"
        :show-file-list="false"
        :custom-request="handleUpload"
        :disabled="uploading"
      >
        <a-button size="small" :loading="uploading">
          <template #icon><icon-upload /></template>上传附件
        </a-button>
      </a-upload>
    </div>

    <!-- 503：总闸关闭或 OSS 未配置，后端 fail-closed；这里显式告知而非报网络错误 -->
    <a-alert v-if="storageDisabled" type="warning" class="att-alert">
      附件存储未启用（后端 BINGOPS_TICKET_ATTACHMENT_ENABLED=false 或 OSS 未配置），请联系管理员开通；已上传的历史附件同样无法下载
    </a-alert>

    <div v-if="items.length" class="att-list">
      <div v-for="att in items" :key="att.id" class="att-item">
        <div class="att-main">
          <a-link class="att-name" @click="handleDownload(att)">{{ att.filename }}</a-link>
          <span class="att-meta">
            {{ formatSize(att.size) }} · {{ att.uploader_name || `#${att.uploaded_by}` }} · {{ formatTime(att.created_at) }}
          </span>
        </div>
        <a-space size="mini">
          <a-button v-if="previewKindOf(att)" type="text" size="mini" @click="openPreview(att)">预览</a-button>
          <a-button type="text" size="mini" @click="handleDownload(att)">下载</a-button>
          <a-popconfirm v-if="canDelete(att)" content="确定删除该附件？" @ok="handleDelete(att)">
            <a-button type="text" size="mini" status="danger" :loading="deletingId === att.id">删除</a-button>
          </a-popconfirm>
        </a-space>
      </div>
    </div>
    <p v-else class="att-hint">暂无附件</p>

    <p v-if="isTerminal" class="att-hint">工单已结束，附件只读（只能下载）</p>
    <p v-else-if="!canWrite" class="att-hint">上传附件需要 ticket:attachment 权限</p>
    <p v-else class="att-hint">
      单文件 ≤ {{ ATTACHMENT_MAX_MB }}MB；支持图片、txt/log/json/csv/md/yaml/sql、pdf、zip/tar 等，单工单最多 50 个
    </p>

    <!-- 预览：fetch blob 后本地渲染，不依赖浏览器直接导航（下载端点需要 Authorization 头） -->
    <a-modal v-model:visible="preview.visible" :title="preview.name" :width="860" :footer="false" unmount-on-close @cancel="closePreview">
      <a-spin :loading="preview.loading" style="width: 100%">
        <img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.name" class="preview-image" />
        <iframe v-else-if="preview.kind === 'pdf'" :src="preview.url" class="preview-pdf"></iframe>
        <pre v-else-if="preview.kind === 'text'" class="preview-text">{{ preview.text }}</pre>
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconUpload } from '@arco-design/web-vue/es/icon'
import type { RequestOption } from '@arco-design/web-vue/es/upload/interfaces'
import * as ticketApi from '../../../api/ticket'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_ALLOWED_EXT, ATTACHMENT_EDITABLE_STATUSES, ATTACHMENT_MAX_MB,
} from '../../../api/ticket'
import type { ITicketAttachment } from '../../../api/ticket'
import { useUserStore } from '../../../stores/user'

const props = defineProps<{
  ticketId: number
  attachments: ITicketAttachment[]
  status: string
}>()
const emit = defineEmits<{ (e: 'changed', list: ITicketAttachment[]): void }>()

const userStore = useUserStore()

const items = ref<ITicketAttachment[]>([...props.attachments])
watch(() => props.attachments, (list) => { items.value = [...list] })

const uploading = ref(false)
const deletingId = ref<number | null>(null)
// 503 后置位：后端 fail-closed，前端持久提示而不是每次都弹网络错误
const storageDisabled = ref(false)

const isTerminal = computed(() => !ATTACHMENT_EDITABLE_STATUSES.includes(props.status))
// 后端上传/删除统一要求 ticket:attachment 权限；终态工单后端也会拒绝写操作
const canWrite = computed(() => !isTerminal.value && userStore.hasPermission('ticket:attachment'))
// 删除额外限制：仅上传者本人或超管（后端同样校验）
function canDelete(att: ITicketAttachment): boolean {
  if (!canWrite.value) return false
  return att.uploaded_by === (userStore.currentUser?.id ?? -1) || (userStore.currentUser?.is_superuser ?? false)
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
const TEXT_EXT = ['txt', 'log', 'json', 'csv', 'md', 'yaml', 'yml', 'sql']

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i < 0 ? '' : filename.slice(i + 1).toLowerCase()
}

function previewKindOf(att: ITicketAttachment): 'image' | 'pdf' | 'text' | null {
  const ext = extOf(att.filename)
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (TEXT_EXT.includes(ext)) return 'text'
  return null
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(t: string): string {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function is503(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status
  if (status === 503) storageDisabled.value = true
  return status === 503
}

// 上传/删除后以服务端为准重取列表（含上传者姓名等派生字段），并把新列表回传给父页同步
async function refresh() {
  try { items.value = (await ticketApi.getTicketAttachments(props.ticketId)).data } catch { /* 拦截器已提示 */ }
  emit('changed', items.value)
}

// Arco 的 customRequest 要求同步返回 UploadRequest（供 abort），所以异步逻辑包一层
function handleUpload(option: RequestOption): { abort: () => void } {
  void doUpload(option)
  return { abort: () => { /* 上传为短请求，不提供中断 */ } }
}

// 前端预校验：扩展名白名单 + 体积上限，避免无谓请求（后端仍会二次校验）
async function doUpload(option: RequestOption) {
  const file = option.fileItem.file
  if (!file) return
  const ext = extOf(file.name)
  if (!(ATTACHMENT_ALLOWED_EXT as readonly string[]).includes(ext)) {
    Message.warning(`不支持的文件类型「.${ext}」，允许：${ATTACHMENT_ALLOWED_EXT.join(' / ')}`)
    option.onError?.()
    return
  }
  if (file.size === 0) {
    Message.warning('文件为空')
    option.onError?.()
    return
  }
  if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
    Message.warning(`文件 ${formatSize(file.size)} 超过单文件上限 ${ATTACHMENT_MAX_MB}MB`)
    option.onError?.()
    return
  }
  uploading.value = true
  try {
    await ticketApi.uploadTicketAttachment(props.ticketId, file)
    option.onSuccess?.({})
    Message.success('附件已上传')
    await refresh()
  } catch (e) {
    option.onError?.(e)
    if (is503(e)) Message.warning('附件存储未启用，请联系管理员')
    /* 其余错误（422 类型/体积、终态只读等）由拦截器透传后端消息 */
  } finally { uploading.value = false }
}

async function handleDelete(att: ITicketAttachment) {
  deletingId.value = att.id
  try {
    await ticketApi.deleteTicketAttachment(props.ticketId, att.id)
    Message.success('附件已删除')
    await refresh()
  } catch (e) {
    if (is503(e)) Message.warning('附件存储未启用，请联系管理员')
  } finally { deletingId.value = null }
}

// 下载：不能用 <a href> 直链（下载端点需要 Authorization 头，直链会 401）
async function handleDownload(att: ITicketAttachment) {
  try {
    const blob = await ticketApi.downloadTicketAttachment(att.download_url)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    if (is503(e)) Message.warning('附件存储未启用，请联系管理员')
  }
}

const preview = reactive({
  visible: false,
  loading: false,
  kind: 'image' as 'image' | 'pdf' | 'text',
  name: '',
  url: '',
  text: '',
})

function releasePreviewUrl() {
  if (preview.url) { URL.revokeObjectURL(preview.url); preview.url = '' }
}

async function openPreview(att: ITicketAttachment) {
  const kind = previewKindOf(att)
  if (!kind) return
  releasePreviewUrl()
  Object.assign(preview, { visible: true, loading: true, kind, name: att.filename, text: '' })
  try {
    const blob = await ticketApi.downloadTicketAttachment(att.download_url)
    if (kind === 'text') preview.text = await blob.text()
    else preview.url = URL.createObjectURL(blob)
  } catch (e) {
    preview.visible = false
    if (is503(e)) Message.warning('附件存储未启用，请联系管理员')
  } finally { preview.loading = false }
}

function closePreview() {
  releasePreviewUrl()
  preview.text = ''
}
</script>

<style scoped lang="scss">
@use '../../../assets/styles/variables' as *;

.att-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: $spacing-md 0 $spacing-xs;
}
.att-count {
  margin-left: 6px;
  padding: 0 6px;
  font-size: $font-size-xs;
  font-weight: 400;
  color: $color-primary;
  background: rgba(22, 119, 255, 0.08);
  border-radius: 8px;
}
.att-alert { margin-bottom: $spacing-sm; }
.att-list { display: flex; flex-direction: column; gap: 2px; }
.att-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: 6px 8px;
  border-radius: $radius-sm;
  &:hover { background: rgba(22, 119, 255, 0.04); }
}
.att-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.att-name { font-size: $font-size-sm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.att-meta { font-size: $font-size-xs; color: $text-hint; }
.att-hint { margin: 4px 0 0; font-size: $font-size-xs; color: $text-hint; line-height: 1.6; }

.preview-image { display: block; max-width: 100%; max-height: 70vh; margin: 0 auto; }
.preview-pdf { width: 100%; height: 70vh; border: 0; }
.preview-text {
  margin: 0;
  max-height: 70vh;
  overflow: auto;
  padding: $spacing-sm;
  font-family: $font-mono;
  font-size: $font-size-xs;
  color: $text-body;
  background: rgba(22, 119, 255, 0.04);
  border-radius: $radius-sm;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
