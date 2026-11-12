// Only transport/service failures allow automatic local startup. A rejected
// login or permission response must remain an authentication error.
export default async function accountRequest (route, body, { fetcher = fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController()
  const unavailable = () => Object.assign(new Error('Backend unavailable. Local features remain available.'), { code: 'BACKEND_UNAVAILABLE' })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    try {
      response = await fetcher('/api/auth/' + route, { signal: controller.signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PandaUI-Auth': '1' }, body: JSON.stringify(body) }) })
    } catch (_) { throw unavailable() }
    if ([404, 502, 503, 504].includes(response.status)) throw unavailable()
    let value
    try { value = await response.json() } catch (_) {
      if (response.ok) throw unavailable() // Static hosts may return index.html for /api.
      throw Object.assign(new Error('The sign-in service returned an invalid response.'), { status: response.status })
    }
    if (!response.ok) throw Object.assign(new Error(value?.code === 'ACCOUNT_IN_USE' ? 'This account is already signed in from another window. Sign in again to sign out the other window.' : value?.error || 'Account request failed.'), { status: response.status, code: value?.code })
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The sign-in service returned an invalid response.')
    return value
  } finally { clearTimeout(timer) }
}
