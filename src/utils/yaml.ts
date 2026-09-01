import { load as yamlLoad, dump as yamlDump, CORE_SCHEMA } from 'js-yaml'

export interface YamlParseResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * YAML 1.2 core schema 解析（js-yaml@4 CORE_SCHEMA，规避 1.1 的 yes/on 布尔坑）。
 * 仅做 UX 即时校验；权威仍是后端 400。
 */
export function parseYaml<T = unknown>(text: string): YamlParseResult<T> {
  if (!text.trim()) return { ok: true, data: undefined as T }
  try {
    return { ok: true, data: yamlLoad(text, { schema: CORE_SCHEMA }) as T }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** dump 保插入序（JSON.parse 保序），lineWidth=-1 避免折行导致往返 diff 噪音 */
export function dumpYaml(obj: unknown): string {
  return yamlDump(obj, { lineWidth: -1 })
}
