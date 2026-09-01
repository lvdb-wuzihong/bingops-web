<template>
  <div ref="containerRef" class="yaml-editor" :style="{ height }"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
// rolldown 对带 ?query 的 exports 子路径解析失败，用相对路径直连 worker 文件
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'

// monaco worker（Vite ?worker 导入；yaml 为 basic-language 无独立 worker）
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

const props = withDefaults(defineProps<{ modelValue: string; height?: string; readonly?: boolean }>(), {
  height: '280px',
  readonly: false,
})
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const containerRef = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  editor = monaco.editor.create(containerRef.value!, {
    value: props.modelValue,
    language: 'yaml',
    theme: 'vs',
    minimap: { enabled: false },
    automaticLayout: true,
    tabSize: 2,
    readOnly: props.readonly,
    scrollBeyondLastLine: false,
    fontSize: 12,
  })
  editor.onDidChangeModelContent(() => emit('update:modelValue', editor?.getValue() ?? ''))
})

// 外部回显（仅当值来自外部变更时覆盖，避免光标跳动）
watch(() => props.modelValue, (v) => {
  if (editor && editor.getValue() !== v) editor.setValue(v)
})
watch(() => props.readonly, (v) => editor?.updateOptions({ readOnly: v }))

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<style scoped lang="scss">
.yaml-editor {
  width: 100%;
  border: 1px solid rgba(22, 119, 255, 0.25);
  border-radius: 4px;
  overflow: hidden;
}
</style>
