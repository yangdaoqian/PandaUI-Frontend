export function inspectGpuPreference (gl) {
  if (!gl || gl.isContextLost?.()) return { kind: 'unknown', renderer: 'Unavailable' }
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  // Browser privacy settings can hide the adapter. Do not infer a discrete GPU
  // from the requested powerPreference: it is only a browser hint.
  const kind = /swiftshader|llvmpipe|software|basic render/i.test(renderer) ? 'software'
    : /intel.*(?:uhd|iris|hd graphics)|radeon\(tm\) graphics/i.test(renderer) ? 'integrated'
      : /nvidia|geforce|quadro|radeon.*(?:rx|pro)|intel.*arc/i.test(renderer) ? 'discrete' : 'unknown'
  return { kind, renderer, preference: gl.getContextAttributes()?.powerPreference || 'unknown' }
}
