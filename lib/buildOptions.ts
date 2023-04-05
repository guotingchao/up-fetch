import { DefaultOptions, FetcherOptions, RequestOptions, SharedOptions } from './createFetcher.js'
import { ResponseError } from './ResponseError.js'

export let specificDefaultOptionsKeys = ['onError', 'onSuccess', 'beforeFetch'] as const

export let specificFetcherOptionsKeys = ['body', 'url', 'params'] as const

let parseResponse = (res: Response) =>
   res
      .clone()
      .json()
      .catch(() => res.text())
      .then((data) => data || null)

let retryStatuses = new Set([408, 413, 429, 500, 502, 503, 504])

let fallbackOptions = {
   parseError: async (res: Response, options: RequestOptions): Promise<ResponseError> =>
      new ResponseError(res, await parseResponse(res), options),
   parseSuccess: parseResponse,
   retryDelay: (count: number) => 2000 * 1.5 ** (count - 1),
   retryWhen: (res: Response) => retryStatuses.has(res.status),
   serializeBody: JSON.stringify,
   serializeParams: (
      params: Parameters<NonNullable<SharedOptions['serializeParams']>>[0],
   ): string =>
      // JSON.parse(JSON.stringify(params)) recursively transforms Dates to ISO strings and strips undefined
      new URLSearchParams(JSON.parse(JSON.stringify(params))).toString(),
}

export let buildOptions = <DD, D = DD>(
   defaultOptions?: DefaultOptions<DD>,
   fetcherOptions?: FetcherOptions<D>,
): RequestOptions<DD, D> => {
   let options = {
      ...fallbackOptions,
      ...omit(defaultOptions, specificFetcherOptionsKeys),
      ...omit(fetcherOptions, specificDefaultOptionsKeys),
   } as RequestOptions<DD, D>

   let { baseUrl = '', url = '', params = '' } = options
   let serializedParams =
      typeof params === 'string' || !params ? params || '' : options.serializeParams(params)
   let isBodyJson = isJsonificable(options.body)

   options.body = isBodyJson ? options.serializeBody(options.body as any) : options.body
   options.href = `${/^https?:\/\//.test(url) ? '' : baseUrl}${url}${withQuestionMark(
      serializedParams,
   )}`
   options.headers = mergeHeaders(
      isBodyJson && { 'content-type': 'application/json' },
      defaultOptions?.headers,
      fetcherOptions?.headers,
   )

   return options
}

/**
 * Are considered Jsonificable:
 * - plain objects
 * - arrays
 * - instances with a toJSON() method
 *
 * class instances without a toJSON() method are NOT considered jsonificable
 */
export let isJsonificable = (body: FetcherOptions['body']): body is object =>
   body?.constructor?.name === 'Object' ||
   Array.isArray(body) ||
   typeof (body as any)?.toJSON === 'function'

export let mergeHeaders = (...list: (HeadersInit | null | false | undefined)[]): Headers =>
   list.reduce(addHeaders, new Headers())

let addHeaders = (h1: Headers, h2?: HeadersInit | null | false) => (
   h2 && new Headers(h2).forEach((value, key) => value !== 'undefined' && h1.set(key, value)), h1
)

// omits the specified keys and obj[key]: undefined
let omit = <O extends Record<string, any>, K extends string>(
   obj: O | undefined,
   keys: readonly K[],
): Omit<O, K> => {
   let copy = { ...obj } as O
   for (let key in copy) {
      if (keys.includes(key as any) || copy[key] === undefined) delete copy[key]
   }
   return copy
}

let withQuestionMark = (str: string) => (!str ? '' : str.startsWith('?') ? str : `?${str}`)
