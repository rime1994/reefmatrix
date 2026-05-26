import client from './client'
import type { WaterParameter } from '@/types'

export const parametersApi = {
  list: (tankId: string, params?: { from?: string; to?: string }) =>
    client.get<WaterParameter[]>(`/tanks/${tankId}/parameters`, { params }).then(r => r.data),

  create: (tankId: string, data: Partial<WaterParameter>) =>
    client.post<WaterParameter>(`/tanks/${tankId}/parameters`, data).then(r => r.data),

  delete: (id: string) => client.delete(`/parameters/${id}`),

  // 导出 CSV：后端直接返回文件流，前端触发浏览器下载
  exportCsv: (tankId: string) =>
    client.get(`/tanks/${tankId}/parameters/export`, { responseType: 'blob' }).then(r => r.data),

  // 导入 CSV：FormData 上传文件
  importCsv: (tankId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post<{ imported: number; skipped: number; errors: number; details: string[] }>(
        `/tanks/${tankId}/parameters/import`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      .then(r => r.data)
  },
}
