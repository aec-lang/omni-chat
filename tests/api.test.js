import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanApiUrl, isSafeMediaUrl, useApi } from '../src/hooks/useApi.js'

test('cleanApiUrl removes trailing slashes and a final v1 path', () => {
  assert.equal(cleanApiUrl('https://api.example.com///'), 'https://api.example.com')
  assert.equal(cleanApiUrl('https://api.example.com/v1'), 'https://api.example.com')
  assert.equal(cleanApiUrl(' https://api.example.com/base/v1/ '), 'https://api.example.com/base')
  assert.equal(cleanApiUrl(null), '')
})

test('isSafeMediaUrl blocks executable URL schemes', () => {
  globalThis.window = { location: { origin: 'https://omnichat.example' } }
  assert.equal(isSafeMediaUrl('https://cdn.example/image.png'), true)
  assert.equal(isSafeMediaUrl('data:image/png;base64,a'), true)
  assert.equal(isSafeMediaUrl('javascript:alert(1)'), false)
  assert.equal(isSafeMediaUrl('file:///etc/passwd'), false)
  delete globalThis.window
})

test('chat cancellation stops a response stream after headers arrived', async (context) => {
  const controller = new AbortController()
  let cancelled = false
  const stream = new ReadableStream({
    start(target) { target.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')) },
    cancel() { cancelled = true },
  })
  context.mock.method(globalThis, 'fetch', async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  globalThis.window = { setTimeout, clearTimeout }
  try {
    await assert.rejects(useApi().streamChat({ apiUrl: 'https://api.example', model: 'model', messages: [], signal: controller.signal, onToken: () => controller.abort() }), { name: 'AbortError' })
    assert.equal(cancelled, true)
  } finally { delete globalThis.window }
})

test('chat handles split UTF-8 chunks and stops at DONE without waiting for a server close', async (context) => {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"سلام"}}]}\r\n\r\ndata: [DONE]\n\n')
  let cancelled = false
  const stream = new ReadableStream({
    start(target) { target.enqueue(bytes.slice(0, 44)); target.enqueue(bytes.slice(44)) },
    cancel() { cancelled = true },
  })
  context.mock.method(globalThis, 'fetch', async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  globalThis.window = { setTimeout, clearTimeout }
  let result = ''
  try {
    await useApi().streamChat({ apiUrl: 'https://api.example', model: 'model', messages: [], onToken: token => { result += token } })
    assert.equal(result, 'سلام')
    assert.equal(cancelled, true)
  } finally { delete globalThis.window }
})

test('agent API sends tool definitions and preserves structured tool calls', async (context) => {
  const tools = [{ type: 'function', function: { name: 'read_document' } }]
  const call = { id: 'one', type: 'function', function: { name: 'read_document', arguments: '{"document_id":"selected"}' } }
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.example/v1/chat/completions')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.tools, tools)
    assert.equal(body.stream, false)
    assert.equal(body.tool_choice, 'auto')
    return Response.json({ choices: [{ message: { content: null, tool_calls: [call] } }] })
  })
  globalThis.window = { setTimeout, clearTimeout }
  try {
    const result = await useApi().agentChat({ apiUrl: 'https://api.example', model: 'model', messages: [], tools })
    assert.deepEqual(result.tool_calls, [call])
  } finally { delete globalThis.window }
})
