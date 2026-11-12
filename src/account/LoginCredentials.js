const preferenceKey = 'pandaui-login-preference'

// Only the opt-in and username belong in app storage. Passwords are owned by
// the browser's credential manager, with native form autofill as the fallback.
export function readLoginPreference (browser = window) {
  try {
    const saved = JSON.parse(browser.localStorage.getItem(preferenceKey))
    if (saved?.remember === true) return { remember: true, username: typeof saved.username === 'string' ? saved.username.slice(0, 64) : '' }
  } catch (_) {}
  return { remember: false, username: '' }
}

export function writeLoginPreference (remember, username, browser = window) {
  try {
    if (remember) browser.localStorage.setItem(preferenceKey, JSON.stringify({ remember: true, username: String(username || '').trim().slice(0, 64) }))
    else browser.localStorage.removeItem(preferenceKey)
  } catch (_) {}
}

export async function storeLoginCredential (username, password, remember, browser = window) {
  writeLoginPreference(remember, username, browser)
  if (!remember || !browser.isSecureContext || typeof browser.PasswordCredential !== 'function' || !browser.navigator?.credentials?.store) return
  try {
    await browser.navigator.credentials.store(new browser.PasswordCredential({ id: username, password, name: username }))
  } catch (_) {
    // Dismissing or disabling browser password saving must not fail sign-in.
  }
}

export async function loadLoginCredential (browser = window) {
  if (!browser.isSecureContext || typeof browser.PasswordCredential !== 'function' || !browser.navigator?.credentials?.get) return null
  try {
    const credential = await browser.navigator.credentials.get({ password: true, mediation: 'silent' })
    return credential?.type === 'password' ? credential : null
  } catch (_) { return null }
}
