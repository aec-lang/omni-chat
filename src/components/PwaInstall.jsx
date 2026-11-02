import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useI18n } from '../i18n'

function PwaInstall() {
  const [event, setEvent] = useState(null)
  const { t } = useI18n()

  useEffect(() => {
    const capture = (installEvent) => {
      installEvent.preventDefault()
      setEvent(installEvent)
    }
    const clear = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', clear)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', clear)
    }
  }, [])

  if (Capacitor.isNativePlatform()) return null
  const iphone = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!event) return iphone && !navigator.standalone
    ? <p className="pwa-help">{t('iphoneInstall')}</p>
    : null

  return (
    <button
      className="install-button"
      type="button"
      onClick={async () => {
        await event.prompt()
        await event.userChoice
        setEvent(null)
      }}
    >
      <Download size={16} /> Install OmniChat
    </button>
  )
}

export default PwaInstall
