import test from 'node:test'
import assert from 'node:assert/strict'
import { runAgent, createAgentTools, MAX_AGENT_STEPS } from '../src/utils/agent.js'
import { readSelectedDocument, MAX_DOCUMENT_BYTES } from '../src/utils/documents.js'

const call = (name, args = '{}') => ({ id: 'call-1', type: 'function', function: { name, arguments: args } })

test('agent returns tool results to the model and finishes with an answer', async () => {
  const events = []
  const drafts = []
  const tools = createAgentTools({ chats: [], onDraft: draft => drafts.push(draft) })
  let requests = 0
  const result = await runAgent({
    messages: [{ role: 'user', content: 'Make a note' }], tools,
    onEvent: event => events.push(event.status),
    request: async ({ messages, tools: definitions }) => {
      requests += 1
      assert.equal(definitions.length, 4)
      if (requests === 1) return { tool_calls: [call('draft_document', JSON.stringify({ name: 'note.md', content: '# Draft' }))] }
      assert.equal(messages.at(-1).role, 'tool')
      assert.equal(messages.at(-1).tool_call_id, 'call-1')
      assert.equal(JSON.parse(messages.at(-1).content).requires_user_action, true)
      return { content: 'Your draft is ready for review.' }
    },
  })
  assert.equal(result.content, 'Your draft is ready for review.')
  assert.equal(drafts.length, 1)
  assert.deepEqual(events, ['running', 'done'])
})

test('unknown and malformed tools return an error without executing anything', async () => {
  for (const requested of [call('__proto__'), call('draft_document', '{broken')]) {
    let requests = 0
    await runAgent({
      messages: [], tools: createAgentTools({ chats: [], onDraft: () => assert.fail('Must not execute') }),
      request: async ({ messages }) => {
        if (++requests === 1) return { tool_calls: [requested] }
        assert.ok(JSON.parse(messages.at(-1).content).error)
        return { content: 'Could not use that tool.' }
      },
    })
  }
})

test('agent stops after the fixed step limit', async () => {
  let requests = 0
  await assert.rejects(runAgent({
    messages: [], tools: {},
    request: async () => { requests += 1; return { tool_calls: [call('missing')] } },
  }), /six-step limit/)
  assert.equal(requests, MAX_AGENT_STEPS)
})

test('cancelling after the model responds prevents tool execution', async () => {
  const controller = new AbortController()
  await assert.rejects(runAgent({
    messages: [], tools: createAgentTools({ chats: [], onDraft: () => assert.fail('Must not execute') }),
    signal: controller.signal,
    request: async () => {
      controller.abort()
      return { tool_calls: [call('draft_document', '{"name":"note.md","content":"text"}')] }
    },
  }), { name: 'AbortError' })
})

test('duplicate call identifiers and excessive calls are rejected', async () => {
  for (const calls of [[call('one'), call('two')], Array.from({ length: 5 }, (_, index) => ({ ...call('one'), id: `call-${index}` }))]) {
    await assert.rejects(runAgent({ messages: [], tools: {}, request: async () => ({ tool_calls: calls }) }), /invalid tool call|too many tools/)
  }
})

test('tools expose bounded chat text and only explicitly attached documents', () => {
  const tools = createAgentTools({
    chats: [{ id: 'chat', title: 'Recipe', apiKey: 'secret', messages: [{ role: 'user', content: 'Recipe '.repeat(1000) }] }],
    documents: [{ id: 'selected', name: 'notes.txt', text: 'Selected text' }], onDraft: () => {},
  })
  assert.equal(tools.search_chats.execute({ query: 'recipe' }).length, 1)
  const result = tools.read_chat.execute({ chat_id: 'chat' })
  assert.equal(result.messages[0].content.length, 1200)
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(tools.read_document.execute({ document_id: 'selected' }).text, 'Selected text')
  assert.throws(() => tools.read_document.execute({ document_id: '/private/file' }), /not found/)
  assert.throws(() => tools.draft_document.execute({ name: '../file.txt', content: 'text' }), /plain filename/)
  assert.throws(() => tools.draft_document.execute({ name: 'run.exe', content: 'text' }), /plain filename/)
})

test('selected documents reject binary, unsupported and oversized files', async () => {
  const valid = { name: 'notes.md', size: 5, text: async () => 'hello' }
  assert.equal((await readSelectedDocument(valid)).text, 'hello')
  await assert.rejects(readSelectedDocument({ ...valid, size: MAX_DOCUMENT_BYTES + 1 }), /64 KB/)
  await assert.rejects(readSelectedDocument({ ...valid, name: 'photo.png' }), /Supported files/)
  await assert.rejects(readSelectedDocument({ ...valid, text: async () => 'binary\0' }), /binary/)
})
