<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <icon-cloud-download class="placeholder-icon" />
      <h2>部署管理</h2>
      <p>应用发布、回滚、CI/CD 流程管理功能即将上线</p>
      <p class="placeholder-tip">通用运维作业编排请使用「作业管理」模块</p>
      <a-tag color="arcoblue" size="large">开发中</a-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconCloudDownload } from '@arco-design/web-vue/es/icon'
</script>

<style scoped lang="scss">
@use '../../assets/styles/variables' as *;

.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - #{$header-height} - #{$spacing-lg} * 2);
}

.placeholder-content {
  text-align: center;
  padding: $spacing-xl * 2;

  .placeholder-icon {
    font-size: 64px;
    color: $color-primary;
    opacity: 0.6;
    margin-bottom: $spacing-lg;
  }

  h2 {
    color: $text-primary;
    font-size: $font-size-xxl;
    margin-bottom: $spacing-sm;
  }

  p {
    color: $text-secondary;
    margin-bottom: $spacing-lg;
  }

  .placeholder-tip {
    font-size: $font-size-xs;
    margin-bottom: $spacing-lg;
  }
}
</style>
