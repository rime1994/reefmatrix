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

  analyze: (tankId: string): Promise<AiAnalysis> =>
    api.post(`/tanks/${tankId}/ai-analysis`).then(r => r.data),
}
