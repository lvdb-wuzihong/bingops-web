<template>
  <div class="otp-input" :class="{ 'is-disabled': disabled, 'is-error': error }">
    <input
      v-for="i in length"
      :key="i"
      :ref="(el) => setInputRef(el, i - 1)"
      class="otp-cell"
      :value="digits[i - 1]"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :maxlength="1"
      :disabled="disabled"
      :aria-label="`第 ${i} 位验证码`"
      @input="handleInput(i - 1, $event)"
      @keydown="handleKeydown(i - 1, $event)"
      @paste="handlePaste"
      @focus="handleFocus"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    length?: number
    disabled?: boolean
    error?: boolean
  }>(),
  { modelValue: '', length: 6, disabled: false, error: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  complete: [value: string]
}>()

const inputRefs = ref<HTMLInputElement[]>([])
const digits = ref<string[]>(toDigits(props.modelValue))

function toDigits(value: string): string[] {
  const chars = (value || '').replace(/\D/g, '').slice(0, props.length).split('')
  return Array.from({ length: props.length }, (_, i) => chars[i] || '')
}

function setInputRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLInputElement) inputRefs.value[index] = el
}

// 外部值同步（如父组件提交失败后清空重输）
watch(
  () => props.modelValue,
  (value) => {
    const next = toDigits(value)
    if (next.join('') !== digits.value.join('')) digits.value = next
  }
)

function emitValue() {
  const value = digits.value.join('')
  emit('update:modelValue', value)
  if (digits.value.every((d) => d !== '')) emit('complete', value)
}

function focusNearest(index: number) {
  const target = Math.min(Math.max(index, 0), props.length - 1)
  inputRefs.value[target]?.focus()
}

function handleInput(index: number, event: Event) {
  const el = event.target as HTMLInputElement
  const raw = el.value.replace(/\D/g, '')
  if (!raw) {
    digits.value[index] = ''
    emitValue()
    return
  }
  // 输入法/自动填充可能一次灌入多位：从当前格开始平铺
  raw
    .slice(0, props.length - index)
    .split('')
    .forEach((ch, offset) => {
      digits.value[index + offset] = ch
    })
  // 受控纠正：值未变化时 Vue 不 patch DOM，手动回写过滤掉非数字字符
  el.value = digits.value[index]
  emitValue()
  focusNearest(index + raw.length)
}

function handleKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    event.preventDefault()
    if (digits.value[index]) {
      digits.value[index] = ''
    } else if (index > 0) {
      digits.value[index - 1] = ''
      focusNearest(index - 1)
    }
    emitValue()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    focusNearest(index - 1)
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusNearest(index + 1)
  }
}

// 整串粘贴：从第一格起平铺，忽略非数字
function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text') || ''
  const chars = text.replace(/\D/g, '').slice(0, props.length).split('')
  if (!chars.length) return
  digits.value = Array.from({ length: props.length }, (_, i) => chars[i] || '')
  emitValue()
  focusNearest(chars.length)
}

// 聚焦时全选当前格，便于直接覆盖
function handleFocus(event: FocusEvent) {
  const el = event.target as HTMLInputElement
  el.select()
}

function focus(index = 0) {
  focusNearest(index)
}

function clear() {
  digits.value = Array.from({ length: props.length }, () => '')
  emit('update:modelValue', '')
}

defineExpose({ focus, clear })
</script>

<style scoped lang="scss">
@use '../assets/styles/variables' as *;

.otp-input {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.otp-cell {
  width: 46px;
  height: 54px;
  padding: 0;
  text-align: center;
  font-family: $font-mono;
  font-size: 22px;
  font-weight: 600;
  color: $text-body;
  background: #fff;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  outline: none;
  transition:
    border-color $transition-fast,
    box-shadow $transition-fast;

  &:focus {
    border-color: $color-primary;
    box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12);
  }

  &:disabled {
    background: #f7f8fa;
    cursor: not-allowed;
  }
}

.is-error {
  .otp-cell {
    border-color: $color-danger;

    &:focus {
      box-shadow: 0 0 0 3px rgba(255, 77, 79, 0.12);
    }
  }
}
</style>
