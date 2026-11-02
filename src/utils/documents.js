export const MAX_DOCUMENT_BYTES = 64 * 1024

export async function readSelectedDocument(file) {
  if (!file || file.size > MAX_DOCUMENT_BYTES) throw new Error('Choose a text file smaller than 64 KB.')
  if (!/\.(txt|md|json|csv|log)$/i.test(file.name)) throw new Error('Supported files: TXT, MD, JSON, CSV and LOG.')
  const text = await file.text()
  if (text.includes('\0')) throw new Error('This file appears to be binary. Choose a text document.')
  return { id: `document-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name.slice(0, 100), text }
}
