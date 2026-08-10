// 统一 API 响应信封
export interface IApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  request_id: string
}

// 分页信息
export interface IPagination {
  page: number
  page_size: number
  total: number
  total_pages: number
}

// 分页数据
export interface IPaginatedData<T> {
  items: T[]
  pagination: IPagination
}

// 通用分页查询参数
export interface IPageParams {
  page?: number
  page_size?: number
}
