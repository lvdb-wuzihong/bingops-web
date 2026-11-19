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

      <a-form v-if="step === 'credentials'" :model="form" :rules="rules" layout="vertical" @submit-success="handleLogin">
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

      <!-- 第二步：动态验证码（账密校验已通过） -->
      <div v-else class="mfa-step">
        <div class="mfa-head">
          <div class="mfa-badge"><icon-safe /></div>
          <h2 class="mfa-title">身份验证</h2>
          <p class="mfa-desc">请输入身份验证器 App（Google Authenticator / 飞书验证器）中显示的 6 位动态验证码</p>
        </div>

        <OtpInput
          ref="otpInputRef"
          v-model="otpCode"
          :disabled="loading"
          :error="otpError"
          @complete="handleMfaLogin"
        />

        <a-alert type="warning" class="mfa-lock-tip">
          动态验证码连续输错 5 次将临时锁定账号（1 小时），请核对后再提交
        </a-alert>

        <a-button
          type="primary"
          long
          size="large"
          class="login-btn"
          :loading="loading"
          :disabled="otpCode.length !== 6"
          @click="handleMfaLogin"
        >
          验证并登录
        </a-button>
        <a-button long class="back-btn" @click="backToCredentials">返回重新登录</a-button>
      </div>

      <template v-if="step === 'credentials'">
        <a-divider>其他登录方式</a-divider>
        <a-button long size="large" class="feishu-btn" @click="handleFeishuLogin">
          <template #icon><icon-link /></template>
          飞书 SSO 登录
        </a-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import axios from 'axios'
import { IconUser, IconLock, IconLink, IconSafe } from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../../stores/user'
import { getFeishuLoginUrl } from '../../api/auth'
import { saveMfaSetupTicket } from '../../utils/mfa'
import OtpInput from '../../components/OtpInput.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const loading = ref(false)

// 登录步骤：credentials=账号密码；mfa=第二步动态验证码
const step = ref<'credentials' | 'mfa'>('credentials')
const mfaTicket = ref('')
const otpCode = ref('')
const otpError = ref(false)
const otpInputRef = ref<InstanceType<typeof OtpInput> | null>(null)

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入用户名' }],
  password: [{ required: true, message: '请输入密码' }],
}

// 站内回跳地址：仅接受以单个 / 开头的路径，防开放重定向（//host 与 /\host 是协议相对 URL）
function safeRedirect(): string {
  const r = route.query.redirect
  if (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\')) return r
  return '/dashboard'
}

async function handleLogin() {
  loading.value = true
  try {
    const outcome = await userStore.login(form.username, form.password)
    if (outcome.status === 'success') {
      Message.success('登录成功')
      router.push(safeRedirect())
      return
    }
    if (outcome.status === 'mfa_required') {
      mfaTicket.value = outcome.mfaTicket
      otpCode.value = ''
      otpError.value = false
      step.value = 'mfa'
      nextTick(() => otpInputRef.value?.focus())
      return
    }
    // 需要先绑定：setup_ticket 仅 5 分钟，存 sessionStorage 交给绑定页；绑定成功直接下发 token
    saveMfaSetupTicket(outcome.setupTicket)
    router.push({
      path: '/mfa/bind',
      query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {},
    })
  } catch (err) {
    // 接口错误已由拦截器提示；本地异常（如登录响应三态缺失）单独提示
    if (!axios.isAxiosError(err) && err instanceof Error) Message.error(err.message)
  } finally {
    loading.value = false
  }
}

// 第二步：动态验证码换 token
async function handleMfaLogin() {
  if (loading.value || otpCode.value.length !== 6) return
  loading.value = true
  otpError.value = false
  try {
    await userStore.loginMfa(mfaTicket.value, otpCode.value)
    Message.success('登录成功')
    router.push(safeRedirect())
  } catch {
    // 失败原因由拦截器弹出（含锁定提示）；清空重输，保留 mfa_ticket
    otpCode.value = ''
    otpError.value = true
    nextTick(() => otpInputRef.value?.focus())
  } finally {
    loading.value = false
  }
}

function backToCredentials() {
  step.value = 'credentials'
  mfaTicket.value = ''
  otpCode.value = ''
  otpError.value = false
}

async function handleFeishuLogin() {
  try {
    // 深链意图：飞书 webview 未登录时先落到登录页（带 redirect），自动 SSO 前持久化目标
    if (route.query.redirect) sessionStorage.setItem('feishu_redirect', String(route.query.redirect))
    const res = await getFeishuLoginUrl()
    window.location.href = res.data.authorize_url
  } catch {
    Message.error('获取飞书授权链接失败')
  }
}

// 飞书内置浏览器（webview）与本浏览器不共享登录态：深链未登录时自动走飞书 SSO，点开即达。
// 防循环：本会话只自动尝试一次（授权/换取失败时用户可手动重试或改用账号密码）
const isFeishuWebview = /Lark|Feishu/i.test(navigator.userAgent)

onMounted(() => {
  if (!isFeishuWebview) return
  if (route.query.redirect) sessionStorage.setItem('feishu_redirect', String(route.query.redirect))
  if (!sessionStorage.getItem('feishu_sso_attempted')) {
    sessionStorage.setItem('feishu_sso_attempted', '1')
    handleFeishuLogin()
  }
})
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

// ===== 第二步：动态验证码 =====
.mfa-step {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.mfa-head {
  text-align: center;
  margin-bottom: $spacing-xs;
}

.mfa-badge {
  width: 52px;
  height: 52px;
  margin: 0 auto $spacing-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(22, 119, 255, 0.08);
  color: $color-primary;
  font-size: 24px;
}

.mfa-title {
  font-size: $font-size-xl;
  color: $text-body;
  margin-bottom: $spacing-xs;
}

.mfa-desc {
  font-size: $font-size-sm;
  color: $text-hint;
  line-height: 1.6;
}

.mfa-lock-tip :deep(.arco-alert-content) {
  font-size: $font-size-xs;
}

.back-btn {
  margin-top: $spacing-xs;
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
