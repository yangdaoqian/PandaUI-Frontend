import { ref } from 'vue'

const recentStorageKey = () => 'pandaui.recentFiles.v2:' + (window.PandaUIAuth?.user.userId || 'signed-out')

const MAX_RECENT_FILES = 20

function isReusableRecentPath (value) {
  const path = String(value || '').trim()
  return !/^[a-zA-Z]:\\fakepath\\/i.test(path) && (/^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || /^\//.test(path))
}

function normalizeRecentFile (value) {
  if (typeof value === 'string') {
    const displayPath = value.trim()
    if (!displayPath) return null
    const reusable = isReusableRecentPath(displayPath)
    return { name: recentFileName(displayPath), path: reusable ? displayPath : '', displayPath, cached: false, reopenable: reusable }
  }
  if (value == null || typeof value !== 'object') return null
  const path = String(value.path || '').trim()
  const displayPath = String(value.displayPath || path || value.name || '').trim()
  const name = String(value.name || recentFileName(displayPath)).trim()
  if (!name) return null
  return { id: value.id || '', name, path, displayPath: displayPath || name, cached: value.cached === true, reopenable: Boolean(path) }
}

function loadRecentFiles () {
  try {
    const stored = window.localStorage.getItem(recentStorageKey())
    const value = JSON.parse(stored || '[]')
    const entries = Array.isArray(value) ? value.map(normalizeRecentFile).filter(Boolean).slice(0, MAX_RECENT_FILES) : []
    return entries
  } catch (_) {
    return []
  }
}

export function fileDisplayPath (file) {
  return file?.path || file?.webkitRelativePath || file?.name || ''
}

export function recentFileName (value) {
  if (value != null && typeof value === 'object' && value.name) return String(value.name)
  return String(value || '').split(/[\\/]/).pop() || String(value || '')
}

export default function useRecentFiles () {
  const recentFiles = ref(loadRecentFiles())

  function rememberRecentEntry (value) {
    const entry = normalizeRecentFile(value)
    if (!entry) return
    const key = (entry.path || entry.name).toLowerCase()
    recentFiles.value = [entry, ...recentFiles.value.filter(item => (item.path || item.name).toLowerCase() !== key)].slice(0, MAX_RECENT_FILES)
    window.localStorage.setItem(recentStorageKey(), JSON.stringify(recentFiles.value))
  }

  function rememberRecentFile (file) {
    const displayPath = fileDisplayPath(file)
    rememberRecentEntry({ name: file?.name || recentFileName(displayPath), path: isReusableRecentPath(displayPath) ? displayPath : '', displayPath, cached: false })
  }

  return { recentFiles, rememberRecentEntry, rememberRecentFile, recentFileName }
}
