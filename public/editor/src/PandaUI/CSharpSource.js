(function (global) {
  'use strict'

  var keywords = new Set(('abstract as async await base break case catch checked class const continue default delegate do else enum event explicit extern false finally fixed for foreach goto if implicit in interface internal is lock namespace new null operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw true try typeof unchecked unsafe using virtual volatile while yield get set value partial where select from let orderby ascending descending group into join equals on by').split(' '))
  var types = new Set(('bool byte sbyte char decimal double float int uint long ulong object short ushort string void var dynamic nint nuint').split(' '))

  function analyze (source) {
    var tokens = []
    var regions = []
    var stack = []
    var line = 0
    var pattern = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?:\$@|@\$|@)"(?:[^"]|"")*(?:"|$)|\$?"(?:\\[\s\S]|[^"\\\n])*(?:"|$)|'(?:\\.|[^'\\\n])*(?:'|$)|\b(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFdDmMuUlL]*)\b|@?[\p{L}_][\p{L}\p{N}_]*|[^\S\n]+|\n|./gu
    var match
    while ((match = pattern.exec(source))) {
      var text = match[0]
      var kind = ''
      if (text.startsWith('//') || text.startsWith('/*')) kind = 'comment'
      else if (/^(?:\$?"|@"|\$@"|@\$"|')/.test(text)) kind = 'string'
      else if (/^\d/.test(text)) kind = 'number'
      else if (keywords.has(text)) kind = 'keyword'
      else if (types.has(text)) kind = 'type'
      else if (/^@?[\p{L}_]/u.test(text)) {
        if (/^\s*(?:<[^<>\n]+>)?\s*\(/.test(source.slice(pattern.lastIndex))) kind = 'method'
        else if (/^[A-Z]/.test(text)) kind = 'type'
        else kind = 'identifier'
      }
      if (!kind && text === '{') stack.push({ start: line, from: pattern.lastIndex })
      else if (!kind && text === '}' && stack.length) {
        var opened = stack.pop()
        if (line > opened.start) regions.push({ start: opened.start, end: line, from: opened.from, to: match.index })
      }
      tokens.push({ from: match.index, to: pattern.lastIndex, text: text, kind: kind })
      line += (text.match(/\n/g) || []).length
    }
    return { tokens: tokens, regions: regions.sort(function (first, second) { return first.from - second.from || second.to - first.to }) }
  }

  function project (source, folds, analysis) {
    analysis = analysis || analyze(source)
    var selected = analysis.regions.filter(function (region) {
      return (folds || []).some(function (fold) { return fold.start === region.start && fold.end === region.end })
    })
    var segments = []
    var visible = ''
    var sourceOffset = 0
    selected.forEach(function (region) {
      if (region.from < sourceOffset) return
      var text = source.slice(sourceOffset, region.from)
      segments.push({ from: sourceOffset, to: region.from, viewFrom: visible.length, viewTo: visible.length + text.length })
      visible += text
      var placeholder = ' … ' + (region.end - region.start) + ' lines … '
      segments.push({ from: region.from, to: region.to, viewFrom: visible.length, viewTo: visible.length + placeholder.length, fold: region })
      visible += placeholder
      sourceOffset = region.to
    })
    segments.push({ from: sourceOffset, to: source.length, viewFrom: visible.length, viewTo: visible.length + source.length - sourceOffset })
    visible += source.slice(sourceOffset)
    return { source: source, text: visible, segments: segments, analysis: analysis, folds: selected }
  }

  function sourceOffset (projection, offset, end) {
    offset = Math.max(0, Math.min(projection.text.length, offset))
    var segment = projection.segments.find(function (item) { return offset >= item.viewFrom && offset < item.viewTo })
    if (!segment) return projection.source.length
    if (!segment.fold) return segment.from + offset - segment.viewFrom
    return offset === segment.viewFrom || !end ? segment.from : segment.to
  }

  function viewOffset (projection, offset) {
    offset = Math.max(0, Math.min(projection.source.length, offset))
    var segment = projection.segments.find(function (item) { return offset >= item.from && offset < item.to })
    return !segment ? projection.text.length : segment.fold ? segment.viewFrom : segment.viewFrom + offset - segment.from
  }

  function edit (projection, nextText) {
    var before = projection.text
    var start = 0
    while (start < before.length && start < nextText.length && before[start] === nextText[start]) start++
    var end = before.length
    var nextEnd = nextText.length
    while (end > start && nextEnd > start && before[end - 1] === nextText[nextEnd - 1]) { end--; nextEnd-- }
    var from = sourceOffset(projection, start, false)
    var to = sourceOffset(projection, end, true)
    var inserted = nextText.slice(start, nextEnd)
    var code = projection.source.slice(0, from) + inserted + projection.source.slice(to)
    var shift = inserted.length - (to - from)
    var regions = analyze(code).regions
    var folds = projection.folds.filter(function (region) { return to <= region.from || from >= region.to })
      .map(function (region) {
        var adjusted = region.from + (to <= region.from ? shift : 0)
        return regions.find(function (candidate) { return candidate.from === adjusted })
      }).filter(Boolean).map(function (region) { return { start: region.start, end: region.end } })
    return { code: code, folds: folds, caret: from + inserted.length }
  }

  global.PandaUICSharpSource = { analyze: analyze, project: project, sourceOffset: sourceOffset, viewOffset: viewOffset, edit: edit }
})(typeof window === 'undefined' ? module.exports : window)
