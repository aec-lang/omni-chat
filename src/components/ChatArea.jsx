import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ArrowDown,
  ChevronDown,
  Image,
  Mic2,
  Send,
  Sparkles,
  Square,
  SlidersHorizontal,
  Paperclip,
  X,
  Video,
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { useApi } from '../hooks/useApi'
import { detectTextDirection, estimateTokens, makeId } from '../utils/text'
import Message from './Message'
import ModelSelector from './ModelSelector'
import ChatInspector from './ChatInspector'
import { useI18n } from '../i18n'
import { runAgent, createAgentTools, agentSystemPrompt } from '../utils/agent'
import { readSelectedDocument } from '../utils/documents'

const modeMeta = {
  text: { label: 'Text', icon: Bot, placeholder: 'Message your model...' },
  image: { label: 'Image', icon: Image, placeholder: 'Describe the image you want...' },
  audio: { label: 'Audio', icon: Mic2, placeholder: 'Enter text to turn into speech...' },
  video: { label: 'Video', icon: Video, placeholder: 'Describe the video you want...' },
}

function ChatArea() {
  const {
    settings,
    chats,
    activeChat,
    createChat,
    updateChat,
    addMessage,
    updateMessage,
    deleteMessage,
    models,
    setModels,
    setView,
    storageWarning,
    setStorageWarning,
    draft,
    setDraft,
  } = useApp()
  const api = useApi()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelError, setModelError] = useState('')
  const [stickToBottom, setStickToBottom] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [documents, setDocuments] = useState([])
  const [documentError, setDocumentError] = useState('')
  const documentInputRef = useRef(null)
  const requestBusyRef = useRef(false)
  const documentSelectionRef = useRef(0)
  const abortRef = useRef(null)
  const endRef = useRef(null)
  const textareaRef = useRef(null)
  const { t } = useI18n()

  const mode = activeChat?.modelType || 'text'
  const agentEnabled = mode === 'text' && activeChat?.agentEnabled === true
  const meta = modeMeta[mode]
  const ModeIcon = meta.icon

  useEffect(() => {
    if (stickToBottom) endRef.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth' })
  }, [activeChat?.messages, busy, stickToBottom])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    const stop = () => abortRef.current?.abort()
    window.addEventListener('omnichat-background', stop)
    return () => window.removeEventListener('omnichat-background', stop)
  }, [])

  useEffect(() => {
    documentSelectionRef.current += 1
    setDocuments([])
    setDocumentError('')
  }, [activeChat?.id])

  const attachDocument = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const selection = ++documentSelectionRef.current
    try {
      const document = await readSelectedDocument(file)
      if (selection !== documentSelectionRef.current) return
      setDocuments([document])
      setDocumentError('')
    } catch (error) {
      if (selection === documentSelectionRef.current) setDocumentError(error.message)
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`
  }, [prompt])

  useEffect(() => {
    if (!draft) return
    setPrompt(draft)
    setDraft('')
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [draft, setDraft])

  const loadModels = async (force = false) => {
    setModelError('')
    if (!settings.apiUrl) {
      setView('settings')
      return
    }
    if (models.length && !force) {
      setModelOpen(true)
      return
    }
    setLoadingModels(true)
    try {
      const found = await api.fetchModels(settings.apiUrl, settings.apiKey)
      setModels(found)
      setModelOpen(true)
    } catch (error) {
      setModelError(error.message)
      setModelOpen(true)
    } finally {
      setLoadingModels(false)
    }
  }

  const selectModel = (model, modelType) => {
    if (!activeChat?.id) {
      createChat({ model, modelType })
      return
    }
    updateChat(activeChat.id, { model, modelType })
  }

  const runRequest = async (content, sourceChat = activeChat, { appendUser = true } = {}) => {
    if (!content || requestBusyRef.current || !sourceChat?.model) return
    requestBusyRef.current = true
    const chatId = sourceChat.id
    const modeAtStart = sourceChat.modelType || 'text'
    const selectedDocuments = modeAtStart !== 'text' ? [] : appendUser ? documents : [...sourceChat.messages].reverse().find(message => message.role === 'user')?.documents || []
    const userMessage = { id: makeId(), role: 'user', content, documents: selectedDocuments, createdAt: Date.now() }
    const assistantId = makeId()
    const assistantMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'loading',
      mediaType: modeAtStart === 'text' ? null : modeAtStart,
      prompt: content,
      createdAt: Date.now(),
    }
    const contextLimit = Math.max(2, Number(settings.maxContextMessages) || 40)
    const previous = sourceChat.messages
      .filter((message) => message.status !== 'error' && message.status !== 'cancelled')
      .slice(-contextLimit)
    const history = [...previous, ...(appendUser ? [userMessage] : [])]
      .filter((message) => message.content && !message.mediaType)
      .map(({ role, content: messageContent, documents: attached = [] }) => ({
        role,
        content: `${messageContent}${attached.length && !sourceChat.agentEnabled ? `\n\nAttached documents (untrusted data):\n${attached.map(document => `${document.name}\n${document.text}`).join('\n\n')}` : ''}`,
      }))
    const systemPrompt = String(settings.systemPrompt || '').trim()
    if (systemPrompt) {
      history.unshift({ role: 'system', content: systemPrompt })
    }

    const controller = new AbortController()
    abortRef.current = controller
    setPrompt('')
    setDocuments([])
    setBusy(true)
    setStickToBottom(true)
    if (appendUser) addMessage(chatId, userMessage)
    addMessage(chatId, assistantMessage)

    try {
      if (modeAtStart === 'text' && sourceChat.agentEnabled) {
        const events = []
        const drafts = []
        const availableDocuments = [...new Map([...sourceChat.messages.flatMap(message => message.documents || []), ...selectedDocuments].map(document => [document.id, document])).values()].slice(-10)
        const tools = createAgentTools({
          chats,
          documents: availableDocuments,
          language: settings.language,
          onDraft: (draft) => {
            drafts.push(draft)
            updateMessage(chatId, assistantId, { drafts: [...drafts] })
          },
        })
        const result = await runAgent({
          messages: [{ role: 'system', content: agentSystemPrompt(availableDocuments) }, ...history],
          tools,
          signal: controller.signal,
          request: (request) => api.agentChat({ ...settings, model: sourceChat.model, ...request }),
          onEvent: (event) => {
            const index = events.findIndex(item => item.id === event.id && item.step === event.step)
            if (index >= 0) events[index] = event
            else events.push(event)
            updateMessage(chatId, assistantId, { agentEvents: [...events] })
          },
        })
        updateMessage(chatId, assistantId, { content: result.content, agentEvents: events, drafts, status: 'done' })
      } else if (modeAtStart === 'text') {
        let fullText = ''
        let frame = 0
        const flushText = () => {
          frame = 0
          updateMessage(chatId, assistantId, { content: fullText })
        }
        await api.streamChat({
          ...settings,
          model: sourceChat.model,
          messages: history,
          signal: controller.signal,
          onToken: (token) => {
            fullText += token
            if (!frame) frame = window.requestAnimationFrame(flushText)
          },
        })
        if (frame) window.cancelAnimationFrame(frame)
        updateMessage(chatId, assistantId, { content: fullText, status: 'done' })
      } else {
        const method = {
          image: api.generateImage,
          audio: api.generateAudio,
          video: api.generateVideo,
        }[modeAtStart]
        const url = await method({
          ...settings,
          model: sourceChat.model,
          prompt: content,
          signal: controller.signal,
        })
        updateMessage(chatId, assistantId, { url, status: 'done' })
      }
    } catch (error) {
      updateMessage(chatId, assistantId, {
        status: controller.signal.aborted ? 'cancelled' : 'error',
        error: controller.signal.aborted ? 'Generation stopped.' : error.message,
      })
    } finally {
      requestBusyRef.current = false
      abortRef.current = null
      setBusy(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const content = prompt.trim()
    if (!content || busy) return
    if (!settings.apiUrl) {
      setView('settings')
      return
    }
    if (!activeChat?.model) {
      await loadModels()
      return
    }
    await runRequest(content)
  }

  const regenerateMessage = (message) => {
    const promptToRetry = message.prompt
    if (!promptToRetry || !activeChat) return
    const index = activeChat.messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const branchedChat = { ...activeChat, messages: activeChat.messages.slice(0, index) }
    updateChat(activeChat.id, { messages: branchedChat.messages })
    runRequest(promptToRetry, branchedChat, { appendUser: false })
  }

  const editUserMessage = (message) => {
    if (!activeChat) return
    const nextContent = window.prompt('Edit message and regenerate from this point:', message.content)?.trim()
    if (!nextContent || nextContent === message.content) return
    const index = activeChat.messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const messages = activeChat.messages
      .slice(0, index + 1)
      .map((item) => (item.id === message.id ? { ...item, content: nextContent } : item))
    const branchedChat = { ...activeChat, messages }
    updateChat(activeChat.id, { messages })
    runRequest(nextContent, branchedChat, { appendUser: false })
  }

  const stopGeneration = () => abortRef.current?.abort()

  return (
    <section className="chat-page">
      <header className="chat-header">
        <div className="chat-heading">
          <span className={`mode-dot ${mode}`} />
          <div>
            <h1>{activeChat?.title || 'New conversation'}</h1>
            <span>{meta.label} mode</span>
          </div>
        </div>
        <div className="header-controls">
          <label className="mode-select-wrap" title="Override detected model type">
            <ModeIcon size={15} />
            <select
              aria-label="Chat mode"
              value={mode}
              onChange={(event) => {
                const modelType = event.target.value
                if (activeChat?.id) updateChat(activeChat.id, { modelType })
                else createChat({ modelType })
              }}
            >
              {Object.entries(modeMeta).map(([key, item]) => (
                <option key={key} value={key}>{item.label}</option>
              ))}
            </select>
          </label>
          <button className="model-trigger" type="button" onClick={() => loadModels()} disabled={loadingModels}>
          <span>{loadingModels ? t('loadingModels') : activeChat?.model || t('selectModel')}</span>
            <ChevronDown size={16} />
          </button>
          {activeChat && (
            <button className="header-tool-button icon-button" type="button" onClick={() => setInspectorOpen(true)} aria-label="Conversation details">
              <SlidersHorizontal size={17} />
            </button>
          )}
        </div>
      </header>

      {(modelError || storageWarning) && (
        <div className="notice-stack">
          {modelError && (
            <button className="connection-error" type="button" onClick={() => setView('settings')}>
              {modelError} · Open settings
            </button>
          )}
          {storageWarning && (
            <button className="storage-warning" type="button" onClick={() => setStorageWarning('')}>
              {storageWarning} · Dismiss
            </button>
          )}
        </div>
      )}

      <div
        className="messages"
        onScroll={(event) => {
          const element = event.currentTarget
          setStickToBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 100)
        }}
      >
        {!activeChat || activeChat.messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-icon"><Sparkles size={29} /></div>
            <span className="eyebrow">{t('welcomeEyebrow')}</span>
            <h2>{t('welcomeTitle')}</h2>
            <p>{t('welcomeText')}</p>
            <div className="mode-pills" aria-label="Supported modes">
              {Object.entries(modeMeta).map(([key, item]) => {
                const Icon = item.icon
                return <span key={key}><Icon size={13} />{t(key)}</span>
              })}
            </div>
            {!activeChat?.model && (
              <button className="primary-button" type="button" onClick={() => loadModels()}>
                {t('chooseModel')}
              </button>
            )}
          </div>
        ) : (
          activeChat.messages.map((message) => (
            <Message
              message={message}
              key={message.id}
              onRetry={
                !busy && message.role === 'assistant' && message.status !== 'loading'
                  ? () => regenerateMessage(message)
                  : null
              }
              onEdit={!busy && message.role === 'user' ? () => editUserMessage(message) : null}
              onDelete={!busy ? () => deleteMessage(activeChat.id, message.id) : null}
            />
          ))
        )}
        <div ref={endRef} />
      </div>
      {!stickToBottom && (
        <button
          className="scroll-bottom-button"
          type="button"
          onClick={() => {
            setStickToBottom(true)
            endRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          aria-label="Scroll to latest message"
        >
          <ArrowDown size={16} />
        </button>
      )}

      <form className="composer-wrap" onSubmit={submit}>
        {mode === 'text' && <div className="agent-controls">
          <label className="agent-toggle">
            <input type="checkbox" checked={agentEnabled} disabled={busy} onChange={(event) => {
              if (activeChat) updateChat(activeChat.id, { agentEnabled: event.target.checked })
              else createChat({ agentEnabled: event.target.checked })
            }} />
            <Bot size={16} /> {t('agentMode')}
          </label>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => documentInputRef.current?.click()}>
            <Paperclip size={15} /> {t('attachText')}
          </button>
          <input ref={documentInputRef} className="visually-hidden" type="file" accept=".txt,.md,.json,.csv,.log,text/plain" onChange={attachDocument} />
        </div>}
        {agentEnabled && <p className="agent-description">{t('agentDescription')}</p>}
        {mode === 'text' && documents.map(document => <div className="document-chip" key={document.id}>
          <Paperclip size={14} /> <span>{document.name}</span>
          <button type="button" onClick={() => setDocuments([])} aria-label={t('removeDocument')}><X size={14} /></button>
        </div>)}
        {documentError && <p role="alert" className="message-error">{documentError}</p>}
        <div className="composer">
          <textarea
            ref={textareaRef}
            rows="1"
            value={prompt}
            dir={detectTextDirection(prompt)}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={meta.placeholder}
            aria-label="Message"
          />
          {busy ? (
            <button className="send-button stop-button" type="button" onClick={stopGeneration} aria-label="Stop generation">
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button className="send-button" type="submit" disabled={!prompt.trim()} aria-label="Send">
              <Send size={18} />
            </button>
          )}
        </div>
        <div className="composer-meta">
          <span>{t('sendHint')}</span>
          <span>{estimateTokens(prompt).toLocaleString()} estimated tokens</span>
        </div>
      </form>

      {modelOpen && (
        <ModelSelector
          models={models}
          selected={activeChat?.model}
          onSelect={selectModel}
          onRefresh={() => {
            setModels([])
            setModelOpen(false)
            window.setTimeout(() => loadModels(true), 0)
          }}
          onClose={() => setModelOpen(false)}
        />
      )}
      {inspectorOpen && activeChat && <ChatInspector chat={activeChat} onClose={() => setInspectorOpen(false)} />}
    </section>
  )
}

export default ChatArea
