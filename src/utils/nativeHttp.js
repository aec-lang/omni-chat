export async function nativeJsonFallback(url, options, signal) {
  if (!/\/v1\/(models|chat\/completions|images\/generations|video\/generations(?:\/[^/]+)?)$/.test(url)) return null
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return null
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
  const data = options.body ? JSON.parse(options.body) : undefined
  if (data?.stream) data.stream = false
  let abortListener
  try {
    const result = await Promise.race([
      CapacitorHttp.request({
        url,
        method: options.method || 'GET',
        headers: options.headers,
        data,
        responseType: 'text',
        connectTimeout: 30000,
        readTimeout: 120000,
        disableRedirects: true,
      }),
      new Promise((resolve, reject) => {
        abortListener = () => reject(new DOMException('Request cancelled.', 'AbortError'))
        signal?.addEventListener('abort', abortListener, { once: true })
      }),
    ])
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    return new Response(typeof result.data === 'string' ? result.data : JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } finally {
    signal?.removeEventListener('abort', abortListener)
  }
}
