import { ref } from 'vue'
import { getUserList } from '../api/user'

/**
 * 用户 ID → 姓名映射（后端多处响应只回 user id，如告警认领人）。
 *
 * 用法：ensureUserNames() 传一批 id，只拉缺失的部分；映射失败时调用方按 `#id` 降级展示。
 * 后端 /users 的 page_size 上限为 100，故分页累加取全（上限 5 页 = 500 人）。
 */
export function useUserNames() {
  const userNameMap = ref<Record<number, string>>({})

  function userName(id: number | null | undefined): string {
    if (!id) return '-'
    return userNameMap.value[id] || `用户 #${id}`
  }

  async function ensureUserNames(ids: Array<number | null | undefined> = []): Promise<void> {
    const missing = [...new Set(ids.filter((i): i is number => !!i && !(i in userNameMap.value)))]
    if (!missing.length) return
    try {
      const first = await getUserList({ page: 1, page_size: 100 })
      const all = [...first.data.items]
      for (let p = 2; all.length < first.data.pagination.total && p <= 5; p++) {
        const res = await getUserList({ page: p, page_size: 100 })
        all.push(...res.data.items)
      }
      for (const u of all) userNameMap.value[u.id] = u.display_name || u.username
    } catch { /* 拉不到就降级为 #id 展示，不打断主流程 */ }
  }

  return { userNameMap, userName, ensureUserNames }
}
