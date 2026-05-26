import client from './client'
import type { User } from '@/types'

interface AuthResponse { user: User; token: string }

export const authApi = {
  // ── v2 邮箱路径 ─────────────────────────────────────────────────────────────

  /** 发送邮箱验证码，防刷：同一邮箱 1 小时内最多 3 次 */
  sendEmailOTP: (email: string) =>
    client.post('/auth/email/send-otp', { email }).then(r => r.data as { message: string }),

  /** 校验验证码，成功返回 otp_token（30min）*/
  verifyEmailOTP: (email: string, code: string) =>
    client.post('/auth/email/verify-otp', { email, code }).then(r => r.data as { otp_token: string }),

  /** 校验邀请码，成功返回 invite_token（30min）*/
  validateInvite: (code: string) =>
    client.post('/auth/validate-invite', { code }).then(r => r.data as { invite_token: string }),

  /** 邮箱注册，消费 quiz_token / otp_token / invite_token 之一 */
  registerV2: (params: {
    email: string
    password: string
    nickname?: string
    quiz_token?: string
    otp_token?: string
    invite_token?: string
  }) =>
    client.post<AuthResponse>('/auth/register', params).then(r => r.data),

  // ── 知识问答注册路径（REG-002）──────────────────────────────────────────────

  /** 获取随机题目（不含答案），用于注册知识问答 */
  getQuizQuestion: () =>
    client.get<{
      id: string
      question: string
      options: string[]
      difficulty: string
      category?: string
    }>('/auth/quiz/question').then(r => r.data),

  /** 提交答案，答对返回 quiz_token（30分钟有效，不绑定邮箱）*/
  submitQuizAnswer: (questionId: string, answer: string) =>
    client.post<{ quiz_token: string }>('/auth/quiz/answer', {
      question_id: questionId,
      answer,
    }).then(r => r.data),

  // ── 登录（identifier = 邮箱 / 手机号 / 用户名，后端自动识别）──────────────

  /** 通用登录：identifier 可以是邮箱、手机号或用户名 */
  loginByIdentifier: (identifier: string, password: string) =>
    client.post<AuthResponse>('/auth/login', { identifier, password }).then(r => r.data),

  /** @deprecated 旧版兼容，新代码请用 loginByIdentifier */
  login: (emailOrPhone: string, password: string, byPhone = false) =>
    client.post<AuthResponse>('/auth/login', byPhone
      ? { phone: emailOrPhone, password }
      : { identifier: emailOrPhone, password }
    ).then(r => r.data),

  // ── 通用 ─────────────────────────────────────────────────────────────────────

  getMe: () =>
    client.get<User>('/auth/me').then(r => r.data),

  changePassword: (oldPassword: string, newPassword: string) =>
    client.put('/auth/password', { old_password: oldPassword, new_password: newPassword }),

  // ── 个人资料（SET-001）────────────────────────────────────────────────────────

  /** 更新个人资料（昵称/用户名/偏好设置） */
  updateProfile: (data: {
    nickname?: string
    username?: string
    timezone?: string
    temp_unit?: string
    salinity_unit?: string
    theme?: string
  }) =>
    client.put<import('@/types').User>('/auth/profile', data).then(r => r.data),

  /** 注销账号（不可恢复，删除所有数据） */
  deleteAccount: () =>
    client.delete('/auth/account'),
}
