<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <icon-bar-chart class="placeholder-icon" />
      <h2>监控日志</h2>
      <p>日志查看、链路追踪、性能监控功能即将上线</p>
      <a-tag color="arcoblue" size="large">开发中</a-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconBarChart } from '@arco-design/web-vue/es/icon'
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
}
</style>
