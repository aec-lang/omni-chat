import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium, webkit } = await import(process.env.OMNI_PLAYWRIGHT_MODULE || 'playwright')
await mkdir('test-artifacts', { recursive: true })

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  let downloads = 0
  let toolResults = 0
  page.on('download', () => { downloads += 1 })
  await page.route('http://127.0.0.1:4173/v1/**', async route => {
    const request = route.request()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.url().endsWith('/models')) return route.fulfill({ headers, json: { data: [{ id: 'fixture-model' }] } })
    const body = request.postDataJSON()
    if (!body.tools) {
      return route.fulfill({ headers: { ...headers, 'content-type': 'text/event-stream' }, body: 'data: {"choices":[{"delta":{"content":"Hello from the test model."}}]}\n\ndata: [DONE]\n\n' })
    }
    const last = body.messages.at(-1)
    if (last.role === 'tool') {
      const result = JSON.parse(last.content)
      assert.equal(result.prepared, true)
      assert.equal(result.requires_user_action, true)
      toolResults += 1
      return route.fulfill({ headers, json: { choices: [{ message: { content: 'Your draft is ready. Choose Save / Share to export it.' } }] } })
    }
    return route.fulfill({ headers, json: { choices: [{ message: {
      content: null,
      tool_calls: [{ id: 'draft-call', type: 'function', function: { name: 'draft_document', arguments: JSON.stringify({ name: 'summary.md', content: '# Mobile agent\n\nCreated by a tool and reviewed by the user.' }) } }],
    } }] } })
  })
  try {
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'One app. Every medium.' }).waitFor()
    await page.getByRole('button', { name: 'Open chat menu' }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('textbox', { name: /^API URL/ }).fill('http://127.0.0.1:4173')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await page.getByRole('button', { name: 'Open chat menu' }).click()
    await page.getByRole('button', { name: 'New chat', exact: true }).click()
    await page.getByRole('button', { name: 'Choose your model', exact: true }).click()
    await page.locator('.model-select-button').filter({ hasText: 'fixture-model' }).click()
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Test ordinary chat')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByText('Hello from the test model.', { exact: true }).waitFor()
    await page.getByRole('checkbox', { name: 'Agent mode', exact: true }).check()
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Prepare a Markdown document')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByText('Your draft is ready. Choose Save / Share to export it.', { exact: true }).waitFor()
    assert.equal(toolResults, 1)
    assert.equal(downloads, 0)
    await page.getByText('📄 summary.md', { exact: true }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save / Share', exact: true }).click(),
    ])
    assert.equal(download.suggestedFilename(), 'summary.md')
    assert.equal(downloads, 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.screenshot({ path: `test-artifacts/${name}-mobile-agent.png`, fullPage: true })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('📄 summary.md', { exact: true }).waitFor()
    assert.equal(await page.getByRole('checkbox', { name: 'Agent mode', exact: true }).isChecked(), true)
    console.log(`PASS ${name}: mobile chat, agent/tool round trip, explicit file export, restored conversation`)
  } catch (error) {
    await page.screenshot({ path: `test-artifacts/${name}-failure.png`, fullPage: true })
    console.error(await page.locator('body').innerText())
    throw error
  } finally {
    await browser.close()
  }
}
