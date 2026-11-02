import test from 'node:test'
import assert from 'node:assert/strict'
import { createCredentialStore } from '../src/utils/credentialStore.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('native credentials migrate to the vault before plaintext is removed and restore on restart', async () => {
  const settings = { apiKey: 'active-secret', apiUrl: 'https://api.example' }
  const profiles = [{ id: 'provider', name: 'Example', apiKey: 'profile-secret' }]
  const storage = memoryStorage({ 'omnichat-settings': JSON.stringify(settings), 'omnichat-provider-profiles': JSON.stringify(profiles) })
  const vault = memoryStorage()
  const restored = await createCredentialStore({ storage, vault }).load()
  assert.equal(restored.settings.apiKey, 'active-secret')
  assert.equal(JSON.parse(storage.getItem('omnichat-settings')).apiKey, '')
  assert.equal(JSON.parse(storage.getItem('omnichat-provider-profiles'))[0].apiKey, '')
  const restarted = await createCredentialStore({ storage, vault }).load()
  assert.equal(restarted.settings.apiKey, 'active-secret')
  assert.equal(restarted.profiles[0].apiKey, 'profile-secret')
})

test('failed vault migration preserves old credentials for recovery', async () => {
  const storage = memoryStorage({ 'omnichat-settings': '{"apiKey":"keep-me"}' })
  const vault = { getItem: async () => null, setItem: async () => { throw new Error('Locked') } }
  await assert.rejects(createCredentialStore({ storage, vault }).load(), /Locked/)
  assert.equal(JSON.parse(storage.getItem('omnichat-settings')).apiKey, 'keep-me')
})

test('serialized credential writes keep the newest value, including clearing and removing profiles', async () => {
  const storage = memoryStorage()
  const vault = memoryStorage()
  const store = createCredentialStore({ storage, vault })
  await Promise.all([
    store.persist({ apiKey: 'first' }, [{ id: 'old', apiKey: 'old-key' }]),
    store.persist({ apiKey: 'second' }, []),
    store.persist({ apiKey: '' }, []),
  ])
  const restored = await createCredentialStore({ storage, vault }).load()
  assert.equal(restored.settings.apiKey, '')
  assert.deepEqual(restored.profiles, [])
})

test('browser settings remain compatible with existing local storage', async () => {
  const storage = memoryStorage()
  const store = createCredentialStore({ storage })
  await store.persist({ apiKey: 'browser-key' }, [])
  assert.equal((await store.load()).settings.apiKey, 'browser-key')
})
