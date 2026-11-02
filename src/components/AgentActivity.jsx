import { useState } from 'react'
import { Download } from 'lucide-react'
import { saveTextFile } from '../utils/native'
import { useI18n } from '../i18n'

export default function AgentActivity({ message }) {
  const { t } = useI18n()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <>
    {message.agentEvents?.length > 0 && <details className="agent-activity" open={message.status === 'loading'}>
      <summary>{t('agentActivity')} · {message.agentEvents.length}</summary>
      <ol>{message.agentEvents.map(event => <li key={`${event.step}-${event.id}`}>
        <span aria-hidden="true">{event.status === 'done' ? '✓' : event.status === 'running' ? '◌' : '×'}</span>
        <span>{event.label}</span><small>{event.status}</small>
      </li>)}</ol>
    </details>}
    {message.documents?.map(document => <div className="document-chip" key={document.id}>📄 {document.name}</div>)}
    {message.drafts?.map(draft => <details className="document-draft" key={draft.id}>
      <summary>📄 {draft.name}</summary>
      <p>{t('draftPreview')}</p>
      <pre>{draft.content}</pre>
      <button type="button" className="secondary-button" disabled={saving} onClick={async () => {
        setError('')
        setSaving(true)
        try { await saveTextFile(draft.content, draft.name) }
        catch { setError('Could not save or share this file. Please try again.') }
        finally { setSaving(false) }
      }}><Download size={15} /> {t('saveDraft')}</button>
    </details>)}
    {error && <p className="message-error" role="alert">{error}</p>}
  </>
}
