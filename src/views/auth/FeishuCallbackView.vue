<template>
  <div class="feishu-callback">
    <div class="callback-card">
      <a-spin :loading="loading" :size="32">
        <div class="callback-body">
          <h2 class="callback-title">飞书登录</h2>
          <p class="callback-status">{{ statusText }}</p>
        </div>
      </a-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'
import { feishuCallback } from '../../api/auth'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const loading = ref(true)
const statusText = ref('正在通过飞书授权登录…')

onMounted(async () => {
  const code = route.query.code
  if (typeof code !== 'string' || !code) {
    statusText.value = '授权参数缺失，请重新登录'
    loading.value = false
    setTimeout(() => router.replace('/auth/login'), 1500)
    return
  }
  try {
    const res = await feishuCallback(code)
    userStore.setTokens(res.data.access_token, res.data.refresh_token)
    await userStore.fetchUserInfo()
    statusText.value = '登录成功，正在跳转…'
    router.replace('/dashboard')
  } catch {
    // 失败原因已由拦截器弹出（账号未绑定/飞书配置错误等）
    statusText.value = '飞书登录失败，即将返回登录页'
    loading.value = false
    setTimeout(() => router.replace('/auth/login'), 1800)
  }
})
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.feishu-callback {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: $bg-base;
}

.callback-card {
  width: 380px; padding: $spacing-xl;
  background: $bg-card; border: 1px solid $border-color; border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

.callback-body { text-align: center; }
.callback-title { margin: 0 0 $spacing-sm; font-size: 20px; color: $text-primary; }
.callback-status { margin: 0; color: $text-secondary; }
</style>
