function readJson(storage, key, fallback) {
  const value = storage.getItem(key)
  if (!value) return fallback
  return JSON.parse(value)
}

export function createCredentialStore({ storage, vault = null }) {
  let writes = Promise.resolve()
  const vaultKey = 'omnichat-credentials-v1'
  const persist = (settings, profiles) => {
    const settingsSnapshot = { ...settings }
    const profileSnapshot = profiles.map(profile => ({ ...profile }))
    writes = writes.catch(() => {}).then(async () => {
      if (vault) {
        await vault.setItem(vaultKey, JSON.stringify({
          apiKey: settingsSnapshot.apiKey,
          profiles: Object.fromEntries(profileSnapshot.map(profile => [profile.id, profile.apiKey])),
        }))
      }
      storage.setItem('omnichat-settings', JSON.stringify(vault ? { ...settingsSnapshot, apiKey: '' } : settingsSnapshot))
      storage.setItem('omnichat-provider-profiles', JSON.stringify(profileSnapshot.map(profile => vault ? { ...profile, apiKey: '' } : profile)))
    })
    return writes
  }
  return {
    persist,
    async load() {
      const settings = readJson(storage, 'omnichat-settings', {})
      const profiles = readJson(storage, 'omnichat-provider-profiles', [])
      if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Array.isArray(profiles)) {
        throw new Error('Saved connection settings are invalid. Restore a valid backup before migrating credentials.')
      }
      const validProfiles = profiles.filter(profile => profile && typeof profile === 'object' && typeof profile.id === 'string')
      if (!vault) return { settings, profiles: validProfiles }
      const saved = await vault.getItem(vaultKey)
      const credentials = saved ? JSON.parse(saved) : {}
      const restoredSettings = { ...settings, apiKey: settings.apiKey || credentials.apiKey || '' }
      const restoredProfiles = validProfiles.map(profile => ({
        ...profile,
        apiKey: profile.apiKey || (Object.hasOwn(credentials.profiles || {}, profile.id) ? credentials.profiles[profile.id] : '') || '',
      }))
      await persist(restoredSettings, restoredProfiles)
      return { settings: restoredSettings, profiles: restoredProfiles }
    },
  }
}
