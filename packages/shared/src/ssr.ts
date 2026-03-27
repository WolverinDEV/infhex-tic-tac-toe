export type SSRResult = {
    head: string,
    html: string
}

export type SSRInput = {
    url: string,
    timestamp: number,
    queryClient: unknown /* QueryClient */,
}

export type SSRModule = (params: SSRInput) => SSRResult;