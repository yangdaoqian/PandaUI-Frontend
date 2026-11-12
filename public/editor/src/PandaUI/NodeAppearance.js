(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUINodeAppearance = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var defaults = Object.freeze({
    backgroundColor: '#eef3f5',
    backgroundOpacity: 0,
    titleBackgroundColor: '#eef3f5',
    titleOpacity: 0.25,
    controlBackgroundColor: '#f0f4f6',
    controlOpacity: 0.25,
    borderColor: '#666666',
    borderWidth: 1,
    cornerRadius: 7,
    selectedBorderColor: '#3984c6',
    selectedBorderWidth: 2,
    textColor: '#29475a',
    titleColor: '#29475a',
    fontFamily: 'Arial',
    fontSize: 12,
    titleFontSize: 13,
    linkColorMode: 'type',
    linkColor: '#476b8b',
    linkWidth: 1.5,
    linkOpacity: 1,
    linkShape: 'curve',
    portColorMode: 'type',
    portColor: '#476b8b',
    portRadius: 5,
    showStatusLine: true,
    showStatusBadge: false,
    showResizeHandle: true
  })
  var ranges = {
    backgroundOpacity: [0, 1],
    titleOpacity: [0, 1],
    controlOpacity: [0, 1],
    borderWidth: [0, 4],
    selectedBorderWidth: [1, 6],
    cornerRadius: [0, 20],
    fontSize: [10, 18],
    titleFontSize: [11, 20],
    linkWidth: [0.5, 5],
    linkOpacity: [0.1, 1],
    portRadius: [3, 8]
  }
  var choices = { fontFamily: ['Arial', 'Segoe UI', 'sans-serif', 'monospace'], linkColorMode: ['type', 'custom'], portColorMode: ['type', 'custom'], linkShape: ['curve', 'straight'] }
  function normalize (settings) {
    settings = settings || {}
    var result = {}
    Object.keys(defaults).forEach(function (key) {
      var value = settings[key]
      var fallback = defaults[key]
      if (ranges[key]) result[key] = value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.max(ranges[key][0], Math.min(ranges[key][1], Number(value))) : fallback
      else if (choices[key]) result[key] = choices[key].indexOf(value) >= 0 ? value : fallback
      else if (typeof fallback === 'boolean') result[key] = typeof value === 'boolean' ? value : fallback
      else result[key] = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
    })
    return result
  }
  function rgba (color, opacity) {
    var number = parseInt(color.slice(1), 16)
    return 'rgba(' + (number >> 16) + ',' + ((number >> 8) & 255) + ',' + (number & 255) + ',' + opacity + ')'
  }
  function cssVariables (settings) {
    return {
      '--node-text-color': settings.textColor,
      '--node-title-color': settings.titleColor,
      '--node-font-family': settings.fontFamily,
      '--node-font-size': settings.fontSize + 'px',
      '--node-control-bg': rgba(settings.controlBackgroundColor, settings.controlOpacity),
      '--node-border-color': settings.borderColor,
      '--node-border-width': settings.borderWidth + 'px',
      '--node-radius': settings.cornerRadius + 'px',
      '--node-accent': settings.selectedBorderColor,
      '--node-accent-fill': rgba(settings.selectedBorderColor, settings.controlOpacity)
    }
  }
  return { defaults: defaults, normalize: normalize, rgba: rgba, cssVariables: cssVariables }
})
