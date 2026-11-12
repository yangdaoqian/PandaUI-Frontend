import { onMounted, onUnmounted, ref } from 'vue'

export default function useMeshProgress () {
  const meshProgressText = ref('idle')

  const meshProgressDone = ref(true)

  const meshProgressError = ref(false)

  const meshProgressStartedAt = ref(0)

  const meshProgressLastPhase = ref('idle')

  function updateMeshProgress (event) {
    const detail = event.detail || {}
    const phase = String(detail.phase || '').trim()
    const processed = Number(detail.processed || 0)
    const total = Number(detail.total || 0)
    const errors = Number(detail.errors || 0)
    const cursor = Number(detail.cursor || detail.definitionObjects || 0)
    const totalDefinitionMeshes = Number(detail.totalDefinitionMeshes || 0)
    const totalTopologyEdges = Number(detail.totalTopologyEdges || 0)
    const elapsedMs = Number(detail.elapsedMs || 0)
    const nativeElapsedMs = Number(detail.nativeElapsedMs || 0)
    if (phase === 'cached' || phase === 'cached-complete' || phase === 'waiting-for-scene' || phase === 'queued' || phase === 'running' || phase === 'deferred' || phase === 'instances') {
      if (meshProgressStartedAt.value === 0 || ['complete', 'complete-with-errors', 'failed', 'idle'].includes(meshProgressLastPhase.value)) meshProgressStartedAt.value = performance.now()
    } else if (phase === 'complete' || phase === 'complete-with-errors' || phase === 'failed' || phase === 'idle') {
      if (meshProgressStartedAt.value === 0 && elapsedMs > 0) meshProgressStartedAt.value = performance.now() - elapsedMs
    }
    const progressElapsedMs = elapsedMs > 0 ? elapsedMs : (meshProgressStartedAt.value > 0 ? performance.now() - meshProgressStartedAt.value : 0)
    const formatElapsed = value => value >= 1000 ? (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 's' : Math.round(value) + 'ms'
    const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
    const progressSuffix = total > 0 ? ' · ' + percent + '% · elapsed ' + formatElapsed(progressElapsedMs) : ''
    const runningDetails = []
    if (totalDefinitionMeshes > 0) runningDetails.push('def ' + cursor + '/' + totalDefinitionMeshes)
    if (totalTopologyEdges > 0) runningDetails.push('edges ' + cursor + '/' + totalTopologyEdges)
    if (nativeElapsedMs > 0) runningDetails.push('native ' + formatElapsed(nativeElapsedMs))
    if (detail.nativeStage) runningDetails.push(String(detail.nativeStage).replace(/^instance-/, ''))
    if (detail.definitionObjectType) runningDetails.push(String(detail.definitionObjectType))
    if (Number(detail.definitionFaceCount || 0) > 0) runningDetails.push('faces ' + Number(detail.definitionFaceCount))
    if (elapsedMs > 0) runningDetails.push('total ' + formatElapsed(elapsedMs))
    const runningSuffix = runningDetails.length > 0 ? ' · ' + runningDetails.join(' · ') : ''
    meshProgressError.value = phase === 'failed'
    meshProgressDone.value = phase === 'complete' || phase === 'complete-with-errors' || (phase === 'cached-complete' && total === 0) || phase === 'idle'
    if (phase === 'cached') meshProgressText.value = 'cached ' + processed + '/' + total + progressSuffix
    else if (phase === 'cached-complete' && total > 0) meshProgressText.value = 'cached ' + processed + '/' + total + progressSuffix + ', generating...'
    else if (phase === 'waiting-for-scene') meshProgressText.value = 'waiting 0/' + total + progressSuffix
    else if (phase === 'waiting-for-import') meshProgressText.value = 'preparing' + progressSuffix
    else if (phase === 'queued') meshProgressText.value = 'queued 0/' + total + progressSuffix
    else if (phase === 'running') meshProgressText.value = 'generating ' + processed + '/' + total + progressSuffix + runningSuffix
    else if (phase === 'deferred') meshProgressText.value = 'loading ' + processed + '/' + total + progressSuffix
    else if (phase === 'instances') meshProgressText.value = 'instances ' + processed + ' · elapsed ' + (progressElapsedMs / 1000).toFixed(1) + 's'
    else if (phase === 'complete-with-errors') meshProgressText.value = 'complete ' + processed + '/' + total + progressSuffix + ', ' + errors + ' failed'
    else if (phase === 'failed') meshProgressText.value = 'failed'
    else if (phase === 'complete') meshProgressText.value = total > 0 ? 'complete ' + processed + '/' + total + progressSuffix : 'complete'
    else if (phase && phase !== 'idle') meshProgressText.value = phase + runningSuffix
    else meshProgressText.value = 'idle'
    meshProgressLastPhase.value = phase || 'idle'
  }

  onMounted(() => window.addEventListener('pandaui-mesh-progress', updateMeshProgress))
  onUnmounted(() => window.removeEventListener('pandaui-mesh-progress', updateMeshProgress))

  return { meshProgressText, meshProgressDone, meshProgressError }
}
