// MFA setup_ticket 交接：登录页（mfa_setup_required）→ 绑定页
// 票据视同绑定凭据：只存 sessionStorage（关闭标签页即失效），不打印、不进日志
const MFA_SETUP_TICKET_KEY = 'mfa_setup_ticket'
// 后端约定 setup_ticket 只有 5 分钟有效，本地提前 10 秒视为过期，避免临界提交必败
const MFA_SETUP_TICKET_TTL_MS = 5 * 60 * 1000 - 10 * 1000

export function saveMfaSetupTicket(ticket: string) {
  sessionStorage.setItem(
    MFA_SETUP_TICKET_KEY,
    JSON.stringify({ ticket, expiresAt: Date.now() + MFA_SETUP_TICKET_TTL_MS })
  )
}

export function readMfaSetupTicket(): string | null {
  const raw = sessionStorage.getItem(MFA_SETUP_TICKET_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { ticket?: string; expiresAt?: number }
    if (parsed.ticket && parsed.expiresAt && parsed.expiresAt > Date.now()) {
      return parsed.ticket
    }
  } catch {
    // 脏数据直接按过期处理
  }
  clearMfaSetupTicket()
  return null
}

export function clearMfaSetupTicket() {
  sessionStorage.removeItem(MFA_SETUP_TICKET_KEY)
}
