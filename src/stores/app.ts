import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const collapsed = ref(false)
  const title = ref('BingOps')

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  return { collapsed, title, toggleCollapsed }
})
