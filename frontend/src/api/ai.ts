import api from './client'

export interface AiUsage {
  used: number
  limit: number
  remaining: number
}

export interface AiAnalysis {
  id: string
  user_id: string
  tank_id?: string
  content: string
  created_at: string
}

export const aiApi = {
  getUsage: (): Promise<AiUsage> =>
    api.get('/ai/usage').then(r => r.data),

  // 返回 null 表示该鱼缸还没有分析记录（后端 204）
  getLatest: (tankId: string): Promise<AiAnalysis | null> =>
    api.get(`/tanks/${tankId}/ai-analysis/latest`)
      .then(r => r.data ?? null)
      .catch(err => err.response?.status === 204 ? null : Promise.reject(err)),

  analyze: (tankId: string): Promise<AiAnalysis> =>
    api.post(`/tanks/${tankId}/ai-analysis`).then(r => r.data),
}
