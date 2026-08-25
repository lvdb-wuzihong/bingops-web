import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { setupRouterGuard } from './guard'
import MainLayout from '../layouts/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    children: [
      {
        path: 'login',
        name: 'Login',
        component: () => import('../views/auth/LoginView.vue'),
        meta: { title: '登录', hidden: true },
      },
    ],
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/dashboard/DashboardView.vue'),
        meta: { title: '仪表盘', icon: 'icon-dashboard' },
      },
      {
        path: 'cmdb',
        name: 'CMDB',
        redirect: '/cmdb/resources',
        meta: { title: 'CMDB 资源管理', icon: 'icon-storage' },
        children: [
          {
            path: 'resources',
            name: 'ResourceList',
            component: () => import('../views/cmdb/AssetList.vue'),
            meta: { title: '资源列表' },
          },
          {
            path: 'resources/:id',
            name: 'ResourceDetail',
            component: () => import('../views/cmdb/AssetDetail.vue'),
            meta: { title: '资源详情', hidden: true },
          },
          {
            path: 'models',
            name: 'ModelManagement',
            component: () => import('../views/cmdb/ModelManagement.vue'),
            meta: { title: '模型管理' },
          },
          {
            path: 'tags',
            name: 'TagManagement',
            component: () => import('../views/cmdb/TagManagement.vue'),
            meta: { title: '标签管理' },
          },
          {
            path: 'apps',
            name: 'BusinessAppList',
            component: () => import('../views/cmdb/BusinessAppList.vue'),
            meta: { title: '业务应用' },
          },
          {
            path: 'changes',
            name: 'ChangeLogList',
            component: () => import('../views/cmdb/ChangeLogList.vue'),
            meta: { title: '变更审计' },
          },
          {
            path: 'sync-tasks',
            name: 'SyncTaskList',
            component: () => import('../views/cmdb/SyncTaskList.vue'),
            meta: { title: '同步任务' },
          },
        ],
      },
      {
        path: 'jobs',
        name: 'Jobs',
        redirect: '/jobs/runbooks',
        meta: { title: '作业管理', icon: 'icon-code' },
        children: [
          {
            path: 'runbooks',
            name: 'RunbookList',
            component: () => import('../views/deploy/RunbookList.vue'),
            meta: { title: 'Runbook 管理' },
          },
          {
            path: 'executions',
            name: 'JobExecutionList',
            component: () => import('../views/deploy/JobExecutionList.vue'),
            meta: { title: '执行记录' },
          },
          {
            path: 'executions/:id',
            name: 'JobExecutionDetail',
            component: () => import('../views/deploy/JobExecutionDetail.vue'),
            meta: { title: '执行详情', hidden: true },
          },
        ],
      },
      {
        path: 'deploy',
        name: 'Deploy',
        component: () => import('../views/deploy/DeployView.vue'),
        meta: { title: '部署管理', icon: 'icon-cloud-download' },
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('../views/monitor/MonitorView.vue'),
        meta: { title: '监控日志', icon: 'icon-bar-chart' },
      },
      {
        path: 'tickets',
        name: 'Tickets',
        component: () => import('../views/tickets/TicketView.vue'),
        meta: { title: '工单系统', icon: 'icon-file' },
      },
      {
        path: 'system',
        name: 'System',
        redirect: '/system/users',
        meta: { title: '系统管理', icon: 'icon-settings' },
        children: [
          {
            path: 'users',
            name: 'UserList',
            component: () => import('../views/system/UserList.vue'),
            meta: { title: '用户管理' },
          },
          {
            path: 'roles',
            name: 'RoleList',
            component: () => import('../views/system/RoleList.vue'),
            meta: { title: '角色管理' },
          },
        ],
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

setupRouterGuard(router)

export default router
