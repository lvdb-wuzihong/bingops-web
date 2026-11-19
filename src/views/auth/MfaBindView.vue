<template>
  <div class="bind-page">
    <div class="bind-bg">
      <div class="bg-grid"></div>
      <div class="bg-glow glow-1"></div>
      <div class="bg-glow glow-2"></div>
    </div>

    <div class="bind-card">
      <div class="bind-header">
        <div class="logo-icon"><icon-safe /></div>
        <h1 class="bind-title">绑定动态验证码</h1>
        <p class="bind-subtitle">为账号开启双因素认证，登录时需输入验证器 App 显示的 6 位动态码</p>
      </div>

      <!-- 阶段一：拉取绑定材料 -->
      <div v-if="phase === 'loading'" class="bind-loading">
        <a-spin :size="28" />
        <p>正在生成绑定信息…</p>
      </div>

      <!-- 失效：票据超时 / 已绑定 / 无权限 -->
      <div v-else-if="phase === 'expired'" class="bind-expired">
        <icon-exclamation-circle-fill class="expired-icon" />
        <h2 class="expired-title">{{ failureTitle }}</h2>
        <p class="expired-desc">{{ failureDesc }}</p>
        <a-button type="primary" long size="large" class="bind-btn" @click="leavePage">
          {{ mode === 'logged-in' ? '返回首页' : '返回登录' }}
        </a-button>
      </div>

      <!-- 阶段二：展示材料并校验首个动态码 -->
      <template v-else>
        <div class="bind-body">
          <div class="qr-side">
            <div class="qr-box">
              <img v-if="qrDataUrl" :src="qrDataUrl" alt="动态验证码绑定二维码" />
            </div>
            <p class="qr-hint">用 Google Authenticator / 飞书验证器 扫描二维码</p>
          </div>

          <div class="secret-side">
            <p class="secret-label">无法扫码？手动输入密钥</p>
            <div class="secret-value">
              <code>{{ formattedSecret }}</code>
              <a-button size="mini" class="copy-btn" @click="copySecret">
                {{ copied ? '已复制' : '复制' }}
              </a-button>
            </div>
            <p class="secret-tip">密钥等同绑定凭据，仅在本页展示，请勿截图或分享给他人</p>
          </div>
        </div>

        <a-divider class="bind-divider" />

        <div class="verify-block">
          <p class="verify-label">输入验证器 App 中显示的 6 位动态码完成绑定</p>
          <OtpInput
            ref="otpInputRef"
            v-model="otpCode"
            :disabled="submitting"
            :error="otpError"
            @complete="handleEnable"
          />
          <a-alert type="warning" class="lock-tip">
            动态验证码连续输错 5 次将临时锁定账号（1 小时），请核对后再提交
          </a-alert>
          <a-button
            type="primary"
            long
            size="large"
            class="bind-btn"
            :loading="submitting"
            :disabled="otpCode.length !== 6"
            @click="handleEnable"
          >
            完成绑定
          </a-button>
          <a-button long class="cancel-btn" @click="leavePage">
            {{ mode === 'logged-in' ? '取消' : '返回登录' }}
          </a-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconSafe, IconExclamationCircleFill } from '@arco-design/web-vue/es/icon'
import { toDataURL } from 'qrcode'
import OtpInput from '../../components/OtpInput.vue'
import { mfaEnable, mfaSetup } from '../../api/auth'
import { useUserStore } from '../../stores/user'
import { clearMfaSetupTicket, readMfaSetupTicket } from '../../utils/mfa'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// loading=生成材料；ready=展示二维码与验证码框；expired=凭证失效/无法开始
const phase = ref<'loading' | 'ready' | 'expired'>('loading')
// setup-ticket=登录硬门禁引导（登录态外）；logged-in=已登录主动绑定
const mode = ref<'setup-ticket' | 'logged-in'>('setup-ticket')
const setupTicket = ref<string | null>(null)
const failureKind = ref<'expired' | 'unavailable'>('expired')

const secret = ref('')
const qrDataUrl = ref('')
const otpCode = ref('')
const otpError = ref(false)
const submitting = ref(false)
const copied = ref(false)
const otpInputRef = ref<InstanceType<typeof OtpInput> | null>(null)

const formattedSecret = computed(() => secret.value.replace(/(.{4})/g, '$1 ').trim())

const failureTitle = computed(() =>
  failureKind.value === 'expired' ? '绑定已超时' : '无法开始绑定'
)

const failureDesc = computed(() =>
  failureKind.value === 'expired'
    ? '绑定票据已失效（有效期 5 分钟），请返回重新登录获取'
    : '当前账号可能已完成绑定或暂无权限，请稍后重试'
)

// 站内回跳，规则与登录页一致（仅单个 / 开头的相对路径，防开放重定向）
function safeRedirect(): string {
  const r = route.query.redirect
  if (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\')) return r
  return '/dashboard'
}

function errorText(err: unknown): string {
  const backend = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  if (backend) return backend
  return err instanceof Error ? err.message : ''
}

// setup_ticket / access token 失效判定：401/403/410 或后端消息含 ticket 过期语义
function isTicketExpired(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  if (status === 401 || status === 403 || status === 410) return true
  return /expired|invalid.*(setup\s*)?ticket|ticket.*(expired|invalid)|已过期|已失效/i.test(errorText(err))
}

async function init() {
  setupTicket.value = readMfaSetupTicket()
  if (setupTicket.value) {
    mode.value = 'setup-ticket'
  } else if (userStore.isLoggedIn) {
    // 已登录主动绑定：Authorization 走本地 access token，页面逻辑完全复用
    mode.value = 'logged-in'
  } else {
    // 无票据且未登录：没有任何可用凭证，直接回登录页
    router.replace('/auth/login')
    return
  }

  try {
    // secret 等同绑定凭据：只进页面状态，不打印、不上报；二维码在本地渲染
    const res = await mfaSetup(setupTicket.value ?? undefined)
    secret.value = res.data.secret
    qrDataUrl.value = await toDataURL(res.data.otpauth_uri, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1d2129', light: '#ffffff' },
    })
    phase.value = 'ready'
    nextTick(() => otpInputRef.value?.focus())
  } catch (err) {
    failureKind.value = isTicketExpired(err) ? 'expired' : 'unavailable'
    phase.value = 'expired'
  }
}

async function handleEnable() {
  if (submitting.value || otpCode.value.length !== 6) return
  submitting.value = true
  otpError.value = false
  try {
    const res = await mfaEnable({ otp_code: otpCode.value }, setupTicket.value ?? undefined)
    clearMfaSetupTicket()
    // setup 流程：响应直接下发 token，登录闭环无需再登；主动绑定模式重复覆盖无副作用
    if (res.data.access_token && res.data.refresh_token) {
      userStore.setTokens(res.data.access_token, res.data.refresh_token)
      await userStore.fetchUserInfo()
    }
    Message.success('动态验证码绑定成功')
    router.replace(safeRedirect())
  } catch (err) {
    // 验证码错误：留在表单清空重输；票据失效：切超时态（具体原因拦截器已弹出）
    otpCode.value = ''
    if (isTicketExpired(err)) {
      clearMfaSetupTicket()
      failureKind.value = 'expired'
      phase.value = 'expired'
      return
    }
    otpError.value = true
    nextTick(() => otpInputRef.value?.focus())
  } finally {
    submitting.value = false
  }
}

async function copySecret() {
  if (!secret.value) return
  try {
    await navigator.clipboard.writeText(secret.value)
  } catch {
    // 非 HTTPS 内网环境降级：临时 textarea + execCommand
    const ta = document.createElement('textarea')
    ta.value = secret.value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function leavePage() {
  clearMfaSetupTicket()
  if (mode.value === 'logged-in') {
    router.replace('/dashboard')
    return
  }
  // 带回原始深链目标，重新登录成功后仍能回跳
  router.replace({
    path: '/auth/login',
    query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {},
  })
}

onMounted(init)
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.bind-page {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-lg;
  position: relative;
  overflow: hidden;
}

.bind-bg {
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

.bind-card {
  width: min(640px, 100%);
  padding: $spacing-xl;
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  backdrop-filter: blur(20px);
  box-shadow: $shadow-card, 0 0 40px rgba(22, 119, 255, 0.05);
  position: relative;
  z-index: 1;
}

.bind-header {
  text-align: center;
  margin-bottom: $spacing-lg;

  .logo-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto $spacing-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(22, 119, 255, 0.08);
    color: $color-primary;
    font-size: 26px;
  }

  .bind-title {
    font-size: $font-size-xxl;
    font-weight: 700;
    color: $text-body;
    margin-bottom: $spacing-xs;
  }

  .bind-subtitle {
    color: $text-hint;
    font-size: $font-size-sm;
    line-height: 1.6;
  }
}

.bind-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-xl 0;
  color: $text-hint;
  font-size: $font-size-sm;
}

.bind-expired {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-lg 0 $spacing-md;
  text-align: center;

  .expired-icon {
    font-size: 48px;
    color: $color-warning;
  }

  .expired-title {
    font-size: $font-size-xl;
    color: $text-body;
  }

  .expired-desc {
    color: $text-hint;
    font-size: $font-size-sm;
    margin-bottom: $spacing-md;
  }

  .bind-btn {
    max-width: 280px;
  }
}

.bind-body {
  display: flex;
  gap: $spacing-lg;
  align-items: flex-start;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: center;
  }
}

.qr-side {
  width: 224px;
  flex-shrink: 0;
  text-align: center;

  .qr-box {
    display: inline-block;
    padding: 12px;
    background: #fff;
    border: 1px solid $border-color;
    border-radius: $radius-md;

    img {
      display: block;
      width: 200px;
      height: 200px;
    }
  }

  .qr-hint {
    margin-top: $spacing-sm;
    color: $text-hint;
    font-size: $font-size-xs;
    line-height: 1.6;
  }
}

.secret-side {
  flex: 1;
  min-width: 0;
  padding-top: $spacing-sm;

  .secret-label {
    color: $text-body;
    font-size: $font-size-sm;
    margin-bottom: $spacing-sm;
  }

  .secret-value {
    display: flex;
    align-items: center;
    gap: $spacing-sm;

    code {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      background: #f7f8fa;
      border: 1px solid $border-color-light;
      border-radius: $radius-sm;
      font-family: $font-mono;
      font-size: $font-size-sm;
      color: $text-body;
      letter-spacing: 0.5px;
      word-break: break-all;
      user-select: all;
    }
  }

  .secret-tip {
    margin-top: $spacing-sm;
    color: $color-warning;
    font-size: $font-size-xs;
    line-height: 1.6;
  }
}

.bind-divider {
  margin: $spacing-lg 0 $spacing-md;
}

.verify-block {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;

  .verify-label {
    text-align: center;
    color: $text-hint;
    font-size: $font-size-sm;
  }
}

.lock-tip :deep(.arco-alert-content) {
  font-size: $font-size-xs;
}

.bind-btn {
  height: 44px;
  font-size: $font-size-lg;
  background: $color-primary;
  border: none;
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.3);

  &:hover {
    box-shadow: 0 6px 24px rgba(22, 119, 255, 0.4);
  }
}

.cancel-btn {
  background: transparent;
  border: 1px solid $border-color;
  color: $text-secondary;

  &:hover {
    border-color: $border-glow;
    color: $text-primary;
  }
}
</style>
