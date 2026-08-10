<template>
  <div class="login-page">
    <div class="login-bg">
      <div class="bg-grid"></div>
      <div class="bg-glow glow-1"></div>
      <div class="bg-glow glow-2"></div>
    </div>

    <div class="login-card">
      <div class="login-header">
        <div class="logo-icon">
          <svg viewBox="0 0 32 32" width="40" height="40">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#00d4ff;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#7b61ff;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="28" height="28" rx="6" fill="none" stroke="url(#logoGrad)" stroke-width="2"/>
            <circle cx="10" cy="16" r="3" fill="#00d4ff"/>
            <circle cx="22" cy="10" r="3" fill="#7b61ff"/>
            <circle cx="22" cy="22" r="3" fill="#0a84ff"/>
            <line x1="13" y1="16" x2="19" y2="10" stroke="#00d4ff" stroke-width="1.5" opacity="0.6"/>
            <line x1="13" y1="16" x2="19" y2="22" stroke="#0a84ff" stroke-width="1.5" opacity="0.6"/>
          </svg>
        </div>
        <h1 class="login-title">BingOps</h1>
        <p class="login-subtitle">智能运维管理平台</p>
      </div>

      <a-form :model="form" :rules="rules" layout="vertical" @submit-success="handleLogin" ref="formRef">
        <a-form-item field="username" label="用户名" hide-label>
          <a-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            allow-clear
          >
            <template #prefix><icon-user /></template>
          </a-input>
        </a-form-item>

        <a-form-item field="password" label="密码" hide-label>
          <a-input-password
            v-model="form.password"
            placeholder="请输入密码"
            size="large"
            allow-clear
          >
            <template #prefix><icon-lock /></template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            long
            size="large"
            :loading="loading"
            class="login-btn"
          >
            登 录
          </a-button>
        </a-form-item>
      </a-form>

      <a-divider>其他登录方式</a-divider>
      <a-button long size="large" class="feishu-btn" @click="handleFeishuLogin">
        <template #icon><icon-link /></template>
        飞书 SSO 登录
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconUser, IconLock, IconLink } from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../../stores/user'
import { getFeishuLoginUrl } from '../../api/auth'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入用户名' }],
  password: [{ required: true, message: '请输入密码' }],
}

async function handleLogin() {
  loading.value = true
  try {
    await userStore.login(form.username, form.password)
    Message.success('登录成功')
    router.push('/dashboard')
  } catch {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false
  }
}

async function handleFeishuLogin() {
  try {
    const res = await getFeishuLoginUrl()
    window.location.href = res.data.url
  } catch {
    Message.error('获取飞书授权链接失败')
  }
}
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.login-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background: $bg-base;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(22, 119, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(22, 119, 255, 0.04) 1px, transparent 1px);
  background-size: 60px 60px;
}

.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);

  &.glow-1 {
    width: 500px;
    height: 500px;
    background: rgba(22, 119, 255, 0.08);
    top: -100px;
    right: -100px;
  }

  &.glow-2 {
    width: 400px;
    height: 400px;
    background: rgba(47, 84, 235, 0.06);
    bottom: -100px;
    left: -100px;
  }
}

.login-card {
  width: 420px;
  padding: $spacing-xl;
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  backdrop-filter: blur(20px);
  box-shadow: $shadow-card, 0 0 40px rgba(22, 119, 255, 0.05);
  position: relative;
  z-index: 1;
}

.login-header {
  text-align: center;
  margin-bottom: $spacing-xl;

  .logo-icon {
    display: flex;
    justify-content: center;
    margin-bottom: $spacing-md;
  }

  .login-title {
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, $color-primary, $color-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: $spacing-xs;
  }

  .login-subtitle {
    color: $text-secondary;
    font-size: $font-size-sm;
  }
}

.login-btn {
  height: 44px;
  font-size: $font-size-lg;
  background: $color-primary;
  border: none;
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.3);

  &:hover {
    box-shadow: 0 6px 24px rgba(22, 119, 255, 0.4);
  }
}

.feishu-btn {
  background: transparent;
  border: 1px solid $border-color;
  color: $text-secondary;

  &:hover {
    border-color: $border-glow;
    color: $text-primary;
  }
}

:deep(.arco-divider-text) {
  background: $bg-card;
  color: $text-disabled;
  font-size: $font-size-xs;
}

:deep(.arco-form-item) {
  margin-bottom: $spacing-md;
}
</style>
