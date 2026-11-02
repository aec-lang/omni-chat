import { Capacitor } from '@capacitor/core'
import { createCredentialStore } from './credentialStore.js'

export async function initializeCredentials() {
  let vault = null
  if (Capacitor.isNativePlatform()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    await SecureStorage.setSynchronize(false)
    vault = SecureStorage
  }
  const store = createCredentialStore({ storage: localStorage, vault })
  const initialData = await store.load()
  return { ...initialData, persist: store.persist }
}

export async function saveTextFile(content, filename) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const safeName = filename.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120) || 'omnichat.txt'
    const path = `exports/${Date.now()}-${safeName}`
    const file = await Filesystem.writeFile({ path, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
    await Share.share({ title: filename, url: file.uri, dialogTitle: 'Save or share document' })
    return
  }
  const { downloadBlob } = await import('./export.js')
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), filename)
}
