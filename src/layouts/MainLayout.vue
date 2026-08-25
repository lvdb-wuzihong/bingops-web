<template>
  <a-layout class="main-layout">
    <!-- 侧边栏 -->
    <a-layout-sider
      :collapsed="appStore.collapsed"
      :width="220"
      :collapsed-width="64"
      class="layout-sider"
      breakpoint="xl"
      @collapse="appStore.toggleCollapsed"
    >
      <div class="sider-logo">
        <div class="logo-icon">
          <svg viewBox="0 0 32 32" width="28" height="28">
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
        <span v-if="!appStore.collapsed" class="logo-text">BingOps</span>
      </div>

      <a-menu
        :default-open-keys="['CMDB', 'System']"
        :selected-keys="selectedKeys"
        :auto-open-selected="true"
        @menu-item-click="onMenuClick"
      >
        <a-menu-item key="Dashboard">
          <template #icon><icon-dashboard /></template>
          仪表盘
        </a-menu-item>
        <a-sub-menu key="CMDB">
          <template #icon><icon-storage /></template>
          <template #title>CMDB 资源管理</template>
          <a-menu-item key="ResourceList">资源列表</a-menu-item>
          <a-menu-item key="ModelManagement">模型管理</a-menu-item>
          <a-menu-item key="TagManagement">标签管理</a-menu-item>
          <a-menu-item key="BusinessAppList">业务应用</a-menu-item>
          <a-menu-item key="ChangeLogList">变更审计</a-menu-item>
          <a-menu-item key="SyncTaskList">同步任务</a-menu-item>
        </a-sub-menu>
        <a-sub-menu key="Jobs">
          <template #icon><icon-code /></template>
          <template #title>作业管理</template>
          <a-menu-item key="RunbookList">Runbook 管理</a-menu-item>
          <a-menu-item key="JobExecutionList">执行记录</a-menu-item>
        </a-sub-menu>
        <a-menu-item key="Deploy">
          <template #icon><icon-cloud-download /></template>
          部署管理
        </a-menu-item>
        <a-menu-item key="Monitor">
          <template #icon><icon-bar-chart /></template>
          监控日志
        </a-menu-item>
        <a-menu-item key="Tickets">
          <template #icon><icon-file /></template>
          工单系统
        </a-menu-item>
        <a-sub-menu key="System">
          <template #icon><icon-settings /></template>
          <template #title>系统管理</template>
          <a-menu-item key="UserList">用户管理</a-menu-item>
          <a-menu-item key="RoleList">角色管理</a-menu-item>
        </a-sub-menu>
      </a-menu>
    </a-layout-sider>

    <!-- 右侧内容 -->
    <a-layout class="layout-right">
      <!-- 顶部栏 -->
      <a-layout-header class="layout-header">
        <div class="header-left">
          <a-button type="text" class="collapse-btn" @click="appStore.toggleCollapsed">
            <template #icon>
              <icon-menu-fold v-if="!appStore.collapsed" />
              <icon-menu-unfold v-else />
            </template>
          </a-button>
          <a-breadcrumb>
            <a-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
              {{ item.title }}
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-badge :count="3" dot>
            <a-button type="text" class="header-action">
              <template #icon><icon-notification /></template>
            </a-button>
          </a-badge>
          <a-dropdown trigger="click">
            <div class="user-info">
              <a-avatar :size="32" :style="{ background: 'linear-gradient(135deg, #00d4ff, #7b61ff)' }">
                {{ userInitial }}
              </a-avatar>
              <span class="user-name">{{ displayName }}</span>
              <icon-down />
            </div>
            <template #content>
              <a-doption disabled>
                <template #icon><icon-user /></template>
                {{ userStore.currentUser?.username }}
              </a-doption>
              <a-doption @click="showChangePassword">
                <template #icon><icon-lock /></template>
                修改密码
              </a-doption>
              <a-doption @click="handleLogout">
                <template #icon><icon-export /></template>
                退出登录
              </a-doption>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <!-- 内容区 -->
      <a-layout-content class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </a-layout-content>
    </a-layout>

    <!-- 修改密码弹窗 -->
    <a-modal
      v-model:visible="pwdVisible"
      title="修改密码"
      :width="440"
      :ok-loading="pwdLoading"
      @ok="handleChangePassword"
    >
      <a-form :model="pwdForm" :rules="pwdRules" layout="vertical" ref="pwdFormRef">
        <a-form-item field="old_password" label="当前密码">
          <a-input-password v-model="pwdForm.old_password" placeholder="请输入当前密码" />
        </a-form-item>
        <a-form-item field="new_password" label="新密码">
          <a-input-password v-model="pwdForm.new_password" placeholder="请输入新密码（至少 6 位）" />
        </a-form-item>
        <a-form-item field="confirm_password" label="确认新密码">
          <a-input-password v-model="pwdForm.confirm_password" placeholder="再次输入新密码" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useAppStore } from '../stores/app'
import { useUserStore } from '../stores/user'
import { changePassword } from '../api/auth'
import {
  IconDashboard,
  IconStorage,
  IconCloudDownload,
  IconCode,
  IconBarChart,
  IconFile,
  IconSettings,
  IconMenuFold,
  IconMenuUnfold,
  IconNotification,
  IconDown,
  IconUser,
  IconLock,
  IconExport,
} from '@arco-design/web-vue/es/icon'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const userStore = useUserStore()

const displayName = computed(() => {
  return userStore.currentUser?.display_name || userStore.currentUser?.username || 'User'
})

const userInitial = computed(() => {
  const name = displayName.value
  return name.charAt(0).toUpperCase()
})

const selectedKeys = computed(() => {
  return [route.name as string]
})

const breadcrumbs = computed(() => {
  const matched = route.matched.filter((item) => item.meta?.title)
  return matched.map((item) => ({
    path: item.path,
    title: item.meta.title as string,
  }))
})

function onMenuClick(key: string) {
  router.push({ name: key })
}

async function handleLogout() {
  await userStore.logout()
  router.push('/auth/login')
}

// 修改密码
const pwdVisible = ref(false)
const pwdLoading = ref(false)
const pwdFormRef = ref()
const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const pwdRules = {
  old_password: [{ required: true, message: '请输入当前密码' }],
  new_password: [
    { required: true, message: '请输入新密码' },
    { minLength: 6, message: '密码至少 6 位' },
  ],
  confirm_password: [
    { required: true, message: '请确认新密码' },
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

function showChangePassword() {
  pwdForm.old_password = ''
  pwdForm.new_password = ''
  pwdForm.confirm_password = ''
  pwdVisible.value = true
}

async function handleChangePassword() {
  const errors = await pwdFormRef.value?.validate()
  if (errors) return
  pwdLoading.value = true
  try {
    await changePassword({
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    })
    Message.success('密码修改成功，请重新登录')
    pwdVisible.value = false
    await userStore.logout()
    router.push('/auth/login')
  } catch {
    Message.error('密码修改失败，请检查当前密码是否正确')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped lang="scss">
@use '../assets/styles/variables' as *;

.main-layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.layout-sider {
  background: $bg-sidebar;
  border-right: 1px solid $border-color-light;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;

  :deep(.arco-layout-sider-children) {
    display: flex;
    flex-direction: column;
  }
}

.sider-logo {
  display: flex;
  align-items: center;
  height: $header-height;
  padding: 0 $spacing-md;
  gap: $spacing-sm;
  border-bottom: 1px solid $border-color-light;
  flex-shrink: 0;

  .logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logo-text {
    font-size: $font-size-xl;
    font-weight: 700;
    background: linear-gradient(135deg, $color-primary, $color-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }
}

.layout-right {
  overflow: hidden;
}

.layout-header {
  height: $header-height;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-lg;
  background: $bg-header;
  border-bottom: 1px solid $border-color-light;
  backdrop-filter: blur(12px);

  .header-left {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }

  .collapse-btn {
    color: $text-secondary;
    font-size: 18px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }

  .header-action {
    color: $text-secondary;
    font-size: 18px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    cursor: pointer;
    padding: $spacing-xs $spacing-sm;
    border-radius: $radius-sm;
    transition: background $transition-fast;

    &:hover {
      background: #f0f5ff;
    }

    .user-name {
      color: $text-primary;
      font-size: $font-size-sm;
    }

    .arco-icon {
      color: $text-secondary;
      font-size: $font-size-xs;
    }
  }
}

.layout-content {
  padding: $spacing-lg;
  overflow-y: auto;
  background: $bg-base;
}

// 路由过渡动画
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity $transition-base, transform $transition-base;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
