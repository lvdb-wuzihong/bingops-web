<template>
  <div class="feishu-callback">
    <div class="callback-card">
      <!-- 阶段一：code 换 token -->
      <a-spin v-if="phase === 'exchanging'" :loading="true" :size="32">
        <div class="callback-body">
          <h2 class="callback-title">飞书登录</h2>
          <p class="callback-status">正在通过飞书授权登录…</p>
        </div>
      </a-spin>

      <!-- 阶段二：飞书 SSO 开户用户首次设置密码（后端免验旧密码） -->
      <template v-else-if="phase === 'setPassword'">
        <h2 class="callback-title">设置登录密码</h2>
        <p class="callback-status">首次飞书登录，请为本账号设置登录密码（也可稍后在右上角设置）</p>
        <a-form :model="pwdForm" :rules="pwdRules" layout="vertical" @submit-success="handleSetPassword">
          <a-form-item field="new_password" label="设置密码">
            <a-input-password v-model="pwdForm.new_password" placeholder="至少 6 位" />
          </a-form-item>
          <a-form-item field="confirm_password" label="确认密码">
            <a-input-password v-model="pwdForm.confirm_password" placeholder="再次输入密码" />
          </a-form-item>
          <a-space direction="vertical" fill style="width: 100%">
            <a-button type="primary" long html-type="submit" :loading="setting">设置并进入系统</a-button>
            <a-button long @click="enterApp">暂不设置，直接进入</a-button>
          </a-space>
        </a-form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useUserStore } from '../../stores/user'
import { changePassword, feishuCallback } from '../../api/auth'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// exchanging=code 换 token；setPassword=飞书开户用户首次设置密码
const phase = ref<'exchanging' | 'setPassword'>('exchanging')
const setting = ref(false)
const pwdForm = reactive({ new_password: '', confirm_password: '' })

const pwdRules = {
  new_password: [
    { required: true, message: '请输入密码' },
    { minLength: 6, message: '密码至少 6 位' },
  ],
  confirm_password: [
    { required: true, message: '请确认密码' },
    {
      validator: (value: string, cb: (msg?: string) => void) => {
        if (value !== pwdForm.new_password) {
          cb('两次输入的密码不一致')
        } else {
          cb()
        }
      },
    },
  ],
}

function enterApp() {
  router.replace('/dashboard')
}

async function handleSetPassword() {
  setting.value = true
  try {
    // 飞书开户用户无旧密码：old_password 不传，后端免验
    await changePassword({ old_password: null, new_password: pwdForm.new_password })
    Message.success('密码设置成功')
    enterApp()
  } catch {
    // 失败原因由拦截器弹出
  } finally {
    setting.value = false
  }
}

onMounted(async () => {
  const code = route.query.code
  if (typeof code !== 'string' || !code) {
    Message.error('飞书授权失败：缺少授权码')
    setTimeout(() => router.replace('/auth/login'), 1500)
    return
  }
  try {
    const res = await feishuCallback(code)
    userStore.setTokens(res.data.access_token, res.data.refresh_token)
    await userStore.fetchUserInfo()
    // 飞书开户用户无本地密码：引导首次设置（可跳过）
    if (userStore.currentUser?.has_password === false) {
      phase.value = 'setPassword'
    } else {
      router.replace('/dashboard')
    }
  } catch {
    // 失败原因已由拦截器弹出（账号未绑定/飞书配置错误等）
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
  width: 400px; padding: $spacing-xl;
  background: $bg-card; border: 1px solid $border-color; border-radius: $radius-lg;
  box-shadow: $shadow-card;
}

.callback-body { text-align: center; }
.callback-title { margin: 0 0 $spacing-sm; font-size: 20px; color: $text-primary; }
.callback-status { margin: 0 0 $spacing-md; color: $text-secondary; }
</style>
