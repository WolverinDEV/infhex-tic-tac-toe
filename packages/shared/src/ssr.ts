export type SSRResult = {
    head: string,
    html: string
}

export type SSRInput = {
    url: string,
    timestamp: number,
    queryClient: any /* QueryClient */,
}

export interface SSRModule {
    (params: SSRInput): SSRResult
}