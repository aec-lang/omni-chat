import { sanitizeFilename } from './text.js'

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadJson(data, filename) {
  const { saveTextFile } = await import('./native.js')
  await saveTextFile(JSON.stringify(data, null, 2), filename)
}

export function chatToMarkdown(chat) {
  const lines = [
    `# ${chat.title}`,
    '',
    `- Model: ${chat.model || 'Not selected'}`,
    `- Mode: ${chat.modelType || 'text'}`,
    `- Exported: ${new Date().toISOString()}`,
    '',
  ]
  for (const message of chat.messages || []) {
    lines.push(`## ${message.role === 'user' ? 'You' : 'OmniChat'}`, '')
    if (message.content) lines.push(message.content, '')
    if (message.prompt && !message.content) lines.push(`Prompt: ${message.prompt}`, '')
    if (message.url) lines.push(`[Generated ${message.mediaType || 'media'}](${message.url})`, '')
    if (message.error) lines.push(`> Error: ${message.error}`, '')
  }
  return lines.join('\n')
}

export async function exportChatMarkdown(chat) {
  const { saveTextFile } = await import('./native.js')
  await saveTextFile(chatToMarkdown(chat), `${sanitizeFilename(chat.title)}.md`)
}
