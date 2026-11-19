/**
 * Owned, byte-indexed ISO 10303-21 reader (no geometry/EXPRESS implementation).
 *
 * await StepPart21Reader.open(blob, { chunkSize, onProgress, signal }) indexes
 * before returning. onProgress({ phase, loaded, total, entityCount }) uses bytes
 * for indexing/reading; planning uses entity counts. jobs are stable opaque handles
 * { id, rootIds: string[], entityCount, estimatedBytes, mode, visible }. IDs are decimal
 * strings, never IEEE-754 numbers. readJob(job) returns an uncached Uint8Array.
 * dispose() releases the Blob/index and invalidates handles. No OCCT work occurs
 * here: callers can tessellate and publish one job before requesting the next.
 *
 * Scope: one ordinary DATA section, internal references, simple shape/presentation
 * representations containing BREP/surface-model items. Complex geometry, context
 * and unit entities are preserved verbatim. Product, mapped-item, transformation,
 * assembly and unit metadata are retained in every body job. Original HEADER bytes,
 * numeric spelling, uncertainty and string escapes are preserved, not interpreted.
 * Styles are selected by their geometric target, including inverse face styles.
 * Other body's representation items are removed; empty shape representations become
 * SHAPE_REPRESENTATIONs with an identity placement (non-meshing assembly placeholders).
 * Empty presentation representations are removed with their inverse dependents.
 * visible=false means every mesh root in that job has whole-body INVISIBILITY
 * (directly or through an unscoped styled item); auxiliary sets do not vote.
 * Mixed, face-only and occurrence-scoped visibility stays visible with warnings.
 * Consumers must apply job.visible; OCCT mesh output alone may ignore INVISIBILITY.
 *
 * This is not a schema validator, tessellator, tolerance converter or exact NURBS
 * evaluator. OCCT owns precision, supported schemas and tessellation. Wire-only,
 * tessellated/CSG roots, external references, edition-3 sections, ambiguous inverse
 * geometry attachments and unrecognized representation layouts use the original
 * whole file, with an explicit reason. No claim of incremental output is made for
 * that fallback. Repeated instances of a body stay together in one job. Metadata
 * (including empty assembly branches) repeats across jobs: consumers must merge
 * hierarchy by path/identity, not count metadata nodes as geometry instances.
 * Use fixed absolute OCCT deflection for comparable tessellation across jobs:
 * relative deflection depends on each snippet's bounding box and can differ from
 * a monolithic import. Unit/uncertainty records themselves are never rescaled.
 * Entity ranges and reference slots use paged typed arrays, not retained JS rows.
 * open() does not select every job: entityCount/estimatedBytes are null for lazy
 * jobs (the handles stay immutable). readMetadata() returns a dependency-
 * complete hierarchy-only STEP, or null for whole-file fallback. Body roots are
 * removed from item lists; empty shape representations use non-meshing placements.
 * Selection walks metadata plus the requested body's dependencies, not the whole
 * entity index. Metadata is repeated in snippets to preserve assembly semantics.
 * Memory is O(compact entity/ref index + largest record + requested job); no source text
 * or all-job byte buffers are retained. open() requires immutable Blob semantics.
 */

const ROOT_TYPES = new Set(['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'SHELL_BASED_SURFACE_MODEL', 'FACE_BASED_SURFACE_MODEL', 'FACETED_BREP', 'GEOMETRIC_SET', 'GEOMETRIC_CURVE_SET'])
const SET_TYPES = new Set(['GEOMETRIC_SET', 'GEOMETRIC_CURVE_SET'])
const SHAPE_TYPES = new Set(['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION', 'FACETED_BREP_SHAPE_REPRESENTATION'])
// A few exporters attach a wireframe representation to the product in
// addition to the solid BREP representation. It is presentation data and
// must not make an otherwise valid BREP partition fall back to whole-file
// import. Its curve payload is intentionally ignored by the native solid
// importer; the exact BREP remains the authoritative source geometry.
const PRESENTATION_TYPES = new Set([
  'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION',
  'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION'
])
const WIREFRAME_TYPES = new Set(['GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION'])
const MEMBERSHIP_TYPES = new Map([['PRESENTATION_LAYER_ASSIGNMENT', 2], ['PRESENTATION_LAYER_WITH_STYLE', 2], ['INVISIBILITY', 0]])
const STYLE_TYPES = new Set(['STYLED_ITEM', 'OVER_RIDING_STYLED_ITEM', 'CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM'])
const PLACEMENT_TYPES = new Set(['AXIS2_PLACEMENT_3D', 'AXIS2_PLACEMENT_2D', 'CARTESIAN_POINT', 'DIRECTION'])
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
const canonicalId = value => value.replace(/^0+/, '') || '0'

// Slots are private uint32 handles, never STEP identifiers. Decimal IDs above
// uint32 (including above 2^53) stay strings. Sparse ID pages avoid allocating up
// to the largest identifier. Forward references reserve slots before definition.
const PAGE_BITS = 16, PAGE_SIZE = 2 ** PAGE_BITS, PAGE_MASK = PAGE_SIZE - 1
class CompactIndex {
  constructor () { this.clear() }
  clear () {
    this.pages = []; this.idPages = new Map(); this.largeIds = new Map(); this.slotIds = new Map()
    this.refPages = []; this.refSize = 0; this.slots = 0; this.size = 0; this.maxDigits = 1
    this.typeLists = [[]]; this.typeIds = new Map(); this.extra = new Map()
  }
  slot (id, create = false) {
    const small = id.length <= 10 && Number(id) <= 0xffffffff
    const number = small ? Number(id) : 0
    const key = number >>> 12
    let page = small ? this.idPages.get(key) : null
    let found = small ? (page?.[number & 4095] || 0) : (this.largeIds.get(id) || 0)
    if (found || !create) return found - 1
    if (this.slots >= 0xfffffffe) throw new Error('STEP compact index exceeds uint32 slot capacity')
    const slot = this.slots++
    if ((slot & PAGE_MASK) === 0) {
      this.pages.push({
        ids: new Uint32Array(PAGE_SIZE),
        starts: new Float64Array(PAGE_SIZE),
        lengths: new Uint32Array(PAGE_SIZE),
        types: new Uint16Array(PAGE_SIZE),
        refs: new Uint32Array(PAGE_SIZE),
        counts: new Uint32Array(PAGE_SIZE)
      })
    }
    found = slot + 1
    if (small) {
      if (!page) { page = new Uint32Array(4096); this.idPages.set(key, page) }
      page[number & 4095] = found
      this.pages[slot >>> PAGE_BITS].ids[slot & PAGE_MASK] = number
    } else { this.largeIds.set(id, found); this.slotIds.set(slot, id) }
    this.maxDigits = Math.max(this.maxDigits, id.length)
    return slot
  }
  id (slot) { return this.slotIds.get(slot) ?? String(this.pages[slot >>> PAGE_BITS].ids[slot & PAGE_MASK]) }
  has (id) { const slot = this.slot(id); return slot >= 0 && !!this.type(slot) }
  type (slot) { return this.pages[slot >>> PAGE_BITS].types[slot & PAGE_MASK] }
  types (slot) { return this.typeLists[this.type(slot)] }
  set (id, row) {
    const slot = this.slot(id, true), page = this.pages[slot >>> PAGE_BITS], at = slot & PAGE_MASK
    if (page.types[at]) throw new Error(`Duplicate entity #${id}`)
    const key = row.types.join('|')
    let type = this.typeIds.get(key)
    if (!type) {
      type = this.typeLists.length
      if (type > 65535) throw new Error('Too many distinct STEP complex entity types')
      this.typeIds.set(key, type); this.typeLists.push(row.types)
    }
    page.types[at] = type; page.starts[at] = row.start; page.lengths[at] = row.end - row.start
    page.refs[at] = this.refSize; page.counts[at] = row.refs.length
    for (const ref of row.refs) {
      if (this.refSize >= 0xffffffff) throw new Error('STEP compact index exceeds uint32 reference capacity')
      const target = this.slot(ref, true), offset = this.refSize++
      if ((offset & PAGE_MASK) === 0) this.refPages.push(new Uint32Array(PAGE_SIZE))
      this.refPages[offset >>> PAGE_BITS][offset & PAGE_MASK] = target
    }
    if (row.items || row.styleTarget) {
      const { items, itemSpan, typeSpan, presentation, styleTarget, nonItemRefs } = row
      this.extra.set(slot, { items, itemSpan, typeSpan, presentation, styleTarget, nonItemRefs })
    }
    this.size++
  }
  * refs (slot) {
    const page = this.pages[slot >>> PAGE_BITS], at = slot & PAGE_MASK
    const end = page.refs[at] + page.counts[at]
    for (let i = page.refs[at]; i < end; i++) yield this.refPages[i >>> PAGE_BITS][i & PAGE_MASK]
  }
  row (slot) {
    const page = this.pages[slot >>> PAGE_BITS], at = slot & PAGE_MASK
    return { id: this.id(slot),
      start: page.starts[at],
      end: page.starts[at] + page.lengths[at],
      types: this.types(slot),
      refs: Array.from(this.refs(slot), ref => this.id(ref)),
      ...this.extra.get(slot) }
  }
  get (id) { const slot = this.slot(id); return slot < 0 || !this.type(slot) ? undefined : this.row(slot) }
  * keys () { for (let i = 0; i < this.slots; i++) if (this.type(i)) yield this.id(i) }
  * values () { for (let i = 0; i < this.slots; i++) if (this.type(i)) yield this.row(i) }
  * matching (predicate) {
    const matches = this.typeLists.map(predicate)
    for (let i = 0; i < this.slots; i++) if (matches[this.type(i)]) yield this.row(i)
  }
  get byteLength () {
    let bytes = 0
    for (const page of this.pages) for (const column of Object.values(page)) bytes += column.byteLength
    for (const page of this.idPages.values()) bytes += page.byteLength
    for (const page of this.refPages) bytes += page.byteLength
    return bytes
  }
}

class SlotSet {
  constructor (index) { this.index = index; this.pages = []; this.size = 0 }
  hasSlot (slot) { return slot >= 0 && !!this.pages[slot >>> PAGE_BITS]?.[slot & PAGE_MASK] }
  addSlot (slot) {
    if (this.hasSlot(slot)) return false
    const page = slot >>> PAGE_BITS
    if (!this.pages[page]) this.pages[page] = new Uint8Array(PAGE_SIZE)
    this.pages[page][slot & PAGE_MASK] = 1; this.size++
    return true
  }
  has (id) { return this.hasSlot(this.index.slot(id)) }
}

function abort (signal) {
  if (signal?.aborted) {
    const error = new Error('STEP reading aborted')
    error.name = 'AbortError'
    throw error
  }
}

// ASCII syntax view with byte-for-byte offsets. Strings (including doubled quote
// escapes), binary literals and comments are blanked, not decoded or searched.
// A literal starts with a $ placeholder so parameter separators remain testable.
function syntax (bytes) {
  const out = new Uint8Array(bytes.length).fill(32)
  let state = 'normal', binaryStart = 0
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i], n = bytes[i + 1]
    if (state === 'comment') {
      if (c === 42 && n === 47) { state = 'normal'; i++ }
    } else if (state === 'string' || state === 'binary') {
      const quote = state === 'string' ? 39 : 34
      if (c === quote) {
        if (state === 'binary') {
          const raw = decoder.decode(bytes.subarray(binaryStart, i))
          if (!/^[0-3][0-9A-F]*$/i.test(raw) || (Number(raw[0]) && (raw.length === 1 || (parseInt(raw.at(-1), 16) & ((1 << Number(raw[0])) - 1))))) throw new Error('Malformed STEP binary literal or padding')
        }
        if (n === quote) i++
        else state = 'normal'
      }
    } else if (c === 47 && n === 42) {
      state = 'comment'; i++
    } else if (c === 39) {
      state = 'string'; out[i] = 36
    } else if (c === 34) {
      state = 'binary'; binaryStart = i + 1; out[i] = 36
    } else out[i] = c
  }
  // ASCII outside strings; BOM is legal only at the beginning of the file.
  return decoder.decode(out)
}

function argsOf (code) {
  const start = code.indexOf('(')
  const args = []
  let depth = 0, from = start + 1
  for (let i = start; i < code.length; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')') {
      depth--
      if (depth === 0) { args.push([from, i]); return args }
    } else if (code[i] === ',' && depth === 1) { args.push([from, i]); from = i + 1 }
  }
  throw new Error('Unbalanced entity parameters')
}

function entity (bytes, start, end, code = syntax(bytes)) {
  const match = /^\s*#\s*(\d+)\s*=\s*/.exec(code)
  if (!match) throw new Error('Unsupported DATA record (expected #id = entity)')
  const id = canonicalId(match[1]), body = code.slice(match[0].length)
  const types = [], typeSet = new Set(), refs = new Set()
  // Validate separators and tokens without building a parameter tree. Keep the
  // compact index's O(largest record) temporary memory and exact byte offsets.
  let at = 0
  const token = /\s*(#\s*\d+|[A-Z_][A-Z_0-9]*|\.[A-Z_][A-Z_0-9]*\.|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[ED][+-]?\d+)?|[(),;$*])/iy
  const fail = () => { throw new Error(`Malformed entity #${id} near byte ${start + match[0].length + at}`) }
  const next = () => { token.lastIndex = at; const m = token.exec(body); if (!m) fail(); at = token.lastIndex; return m[1] }
  let current = next()
  const take = expected => { if (current !== expected) fail(); current = next() }
  const list = depth => {
    if (depth > 64) throw new Error(`Excessively nested STEP parameters in #${id}`)
    take('(')
    if (current !== ')') {
      while (true) {
        if (current === '(') list(depth + 1)
        else if (/^[A-Z_]/i.test(current)) {
          current = next(); list(depth + 1)
        } else {
          if (/^[(),;]/.test(current)) fail()
          if (current[0] === '#') refs.add(canonicalId(current.slice(1).trim()))
          current = next()
        }
        if (current !== ',') break
        current = next()
      }
    }
    take(')')
  }
  const complex = body.trimStart()[0] === '('
  if (/[!@]/.test(body)) throw new Error(`External/user-defined references in #${id}`)
  if (complex) take('(')
  do {
    if (!/^[A-Z_][A-Z_0-9]*$/i.test(current)) fail()
    const type = current.toUpperCase()
    if (typeSet.has(type)) throw new Error(`Duplicate complex entity component ${type} in #${id}`)
    typeSet.add(type); types.push(type); current = next(); list(0)
  // eslint-disable-next-line no-unmodified-loop-condition
  } while (complex && current !== ')')
  if (complex) take(')')
  if (current !== ';' || body.slice(at).trim()) fail()
  const row = { id, start, end, refs: [...refs], types }
  if (!complex && (SHAPE_TYPES.has(types[0]) || PRESENTATION_TYPES.has(types[0]) || STYLE_TYPES.has(types[0]) || MEMBERSHIP_TYPES.has(types[0]))) {
    const args = argsOf(code)
    if (args.length < (types[0] === 'INVISIBILITY' ? 1 : 3)) throw new Error(`Unsupported parameters in #${id}`)
    if (STYLE_TYPES.has(types[0])) {
      const target = /^\s*#\s*(\d+)\s*$/.exec(code.slice(...args[2]))
      if (!target) throw new Error(`Unsupported style target in #${id}`)
      row.styleTarget = canonicalId(target[1])
    } else {
      const itemArg = MEMBERSHIP_TYPES.get(types[0]) ?? 1
      const items = code.slice(...args[itemArg])
      if (!/^\s*\(\s*(?:#\s*\d+\s*(?:,\s*#\s*\d+\s*)*)?\)\s*$/.test(items)) throw new Error(`Unsupported representation item list in #${id}`)
      row.items = [...items.matchAll(/#\s*(\d+)/g)].map(m => canonicalId(m[1]))
      row.itemSpan = args[itemArg]
      // Do not subtract item IDs from the record's refs: the same ID can also
      // occur in another argument, which must remain a dependency after rewrite.
      const outsideItems = code.slice(match[0].length, row.itemSpan[0]) + code.slice(row.itemSpan[1])
      row.nonItemRefs = [...outsideItems.matchAll(/#\s*(\d+)/g)].map(m => canonicalId(m[1]))
      row.typeSpan = [match[0].length, code.indexOf('(', match[0].length)]
      row.presentation = PRESENTATION_TYPES.has(types[0]) || MEMBERSHIP_TYPES.has(types[0])
    }
  }
  return row
}

// Large production STEP files can contain millions of ordinary entities. The
// complete syntax view above is deliberately strict, but creating a decoded
// string and a masked byte array for every record dominates indexing time. The
// large-file path only needs the record span, component types and references;
// detailed presentation rows still go through entity() below. This scanner
// never reads outside one record and ignores references inside strings, binary
// literals and comments.
function fastEntity (bytes, start, end) {
  let at = 0
  const skip = () => {
    while (at < bytes.length) {
      while (at < bytes.length && bytes[at] <= 32) at++
      if (bytes[at] !== 47 || bytes[at + 1] !== 42) return
      at += 2
      while (at < bytes.length && !(bytes[at] === 42 && bytes[at + 1] === 47)) at++
      if (at >= bytes.length) throw new Error(`Malformed entity near byte ${start + at}`)
      at += 2
    }
  }
  const identifier = () => {
    const from = at
    while (at < bytes.length && ((bytes[at] >= 65 && bytes[at] <= 90) || (bytes[at] >= 97 && bytes[at] <= 122) || (bytes[at] >= 48 && bytes[at] <= 57) || bytes[at] === 95)) at++
    return from === at ? null : decoder.decode(bytes.subarray(from, at)).toUpperCase()
  }
  skip()
  if (bytes[at++] !== 35) throw new Error('Unsupported DATA record (expected #id = entity)')
  const idStart = at
  while (at < bytes.length && bytes[at] >= 48 && bytes[at] <= 57) at++
  if (idStart === at) throw new Error(`Malformed entity near byte ${start + at}`)
  const id = canonicalId(decoder.decode(bytes.subarray(idStart, at)))
  skip()
  if (bytes[at++] !== 61) throw new Error(`Malformed entity #${id} near byte ${start + at}`)
  skip()
  const types = []
  const complex = bytes[at] === 40
  if (!complex) {
    const type = identifier()
    if (!type || !/^[A-Z_][A-Z_0-9]*$/.test(type)) throw new Error(`Malformed entity #${id} near byte ${start + at}`)
    types.push(type)
  }
  const refs = new Set()
  let state = 'normal', depth = complex ? 0 : -1
  for (; at < bytes.length; at++) {
    const c = bytes[at], n = bytes[at + 1]
    if (state === 'comment') {
      if (c === 42 && n === 47) { state = 'normal'; at++ }
      continue
    }
    if (state === 'string' || state === 'binary') {
      const quote = state === 'string' ? 39 : 34
      if (c === quote) {
        if (n === quote) at++
        else state = 'normal'
      }
      continue
    }
    if (c === 47 && n === 42) { state = 'comment'; at++; continue }
    if (c === 39) { state = 'string'; continue }
    if (c === 34) { state = 'binary'; continue }
    if (c === 35) {
      let ref = at + 1
      while (ref < bytes.length && bytes[ref] >= 48 && bytes[ref] <= 57) ref++
      if (ref === at + 1) throw new Error(`Malformed entity #${id} near byte ${start + at}`)
      refs.add(canonicalId(decoder.decode(bytes.subarray(at + 1, ref))))
      at = ref - 1
      continue
    }
    if (complex) {
      if (c === 40) { depth++; continue }
      if (c === 41) { depth--; continue }
      if (depth === 1 && ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) {
        const from = at
        const type = identifier()
        const before = at
        while (at < bytes.length && bytes[at] <= 32) at++
        if (bytes[at] === 40) {
          types.push(type)
          at = before - 1
        } else at = from - 1
      }
    }
  }
  if (state !== 'normal' || (complex && depth !== 0)) throw new Error(`Malformed entity #${id} near byte ${start + bytes.length}`)
  const row = { id, start, end, refs: [...refs], types }
  // These rows carry item spans and style targets used by partitioning. Keep
  // the strict parser for this small subset; ordinary geometry rows stay on
  // the allocation-free path.
  if (!complex && (SHAPE_TYPES.has(types[0]) || PRESENTATION_TYPES.has(types[0]) || STYLE_TYPES.has(types[0]) || MEMBERSHIP_TYPES.has(types[0]))) return entity(bytes, start, end)
  return row
}

function closure (index, seeds, excluded = new Set()) {
  const found = new Set(), stack = [...seeds]
  while (stack.length) {
    const id = stack.pop()
    if (found.has(id) || excluded.has(id)) continue
    found.add(id)
    const row = index.get(id)
    if (!row) throw new Error(`Missing reference #${id}`)
    for (const ref of row.refs) stack.push(ref)
  }
  return found
}

function concat (parts, length = parts.reduce((n, p) => n + p.length, 0)) {
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

export class StepPart21Reader {
  static async open (file, options = {}) {
    if (!file || !Number.isSafeInteger(file.size) || typeof file.slice !== 'function') throw new TypeError('Expected a Blob/File with a safe byte size')
    const reader = new StepPart21Reader(file, options)
    try {
      await reader._indexFile()
      abort(reader._signal)
      reader._readVisibility()
      await reader._plan()
      // Enable the bounded source-page cache only after the sequential index
      // scan. Caching during indexing would churn on a large STEP file.
      reader._sourcePageCacheEnabled = reader.mode === 'partitioned'
    } catch (error) {
      if (error.name === 'AbortError' || reader._ioError === error || reader._callbackError === error) { reader.dispose(); throw error }
      reader._whole(error.message)
    }
    return reader
  }

  constructor (file, options) {
    this._file = file
    this._chunkSize = options.chunkSize ?? 1024 * 1024
    if (!Number.isSafeInteger(this._chunkSize) || this._chunkSize < 1) throw new RangeError('chunkSize must be a positive integer')
    this._signal = options.signal
    this._onProgress = options.onProgress
    this._index = new CompactIndex()
    this._plans = new Map()
    this.jobs = []
    this.warnings = []
    this.mode = 'whole'
    this.fallbackReason = null
    this._headerEnd = 0
    this._disposed = false
    this._sourcePageSize = options.sourcePageSize ?? 4 * 1024 * 1024
    this._sourcePageCacheLimit = options.sourcePageCacheBytes ?? 64 * 1024 * 1024
    if (!Number.isSafeInteger(this._sourcePageSize) || this._sourcePageSize < 1) throw new RangeError('sourcePageSize must be a positive integer')
    if (!Number.isSafeInteger(this._sourcePageCacheLimit) || this._sourcePageCacheLimit < this._sourcePageSize) throw new RangeError('sourcePageCacheBytes must hold at least one source page')
    this._sourcePageCache = new Map()
    this._sourcePageCacheBytes = 0
    this._sourcePageCacheEnabled = false
    this._fastIndex = options.fastIndex === true
    this._readStats = null
    this.lastReadTimings = null
  }

  _progress (phase, loaded, total) {
    try { this._onProgress?.({ phase, loaded, total, entityCount: this._entityCount ?? this._index.size }) } catch (error) { this._callbackError = error; throw error }
  }

  async _rawBytes (start, end) {
    abort(this._signal)
    if (this._disposed) throw new Error('STEP reader is disposed')
    try {
      const bytes = new Uint8Array(await this._file.slice(start, end).arrayBuffer())
      if (bytes.length !== end - start) throw new Error('Short STEP Blob read')
      abort(this._signal)
      if (this._disposed) throw new Error('STEP reader is disposed')
      if (this._readStats) {
        this._readStats.rawReads++
        this._readStats.rawReadBytes += bytes.byteLength
      }
      return bytes
    } catch (error) { this._ioError = error; throw error }
  }

  async _readPage (start, end) {
    const page = new Uint8Array(end - start)
    for (let at = start; at < end; at += this._chunkSize) {
      const chunkEnd = Math.min(end, at + this._chunkSize)
      page.set(await this._rawBytes(at, chunkEnd), at - start)
    }
    return page
  }

  async _bytes (start, end) {
    if (!this._sourcePageCacheEnabled || end <= start || end - start > this._sourcePageSize * 2) return this._rawBytes(start, end)
    const first = Math.floor(start / this._sourcePageSize) * this._sourcePageSize
    const last = Math.ceil(end / this._sourcePageSize) * this._sourcePageSize
    // A sparse dependency closure often asks for a few kilobytes spread over
    // many pages. Prefetching a full 4 MiB page for each small range turns a
    // 20 KiB job into tens of MiB of I/O. Use the exact bounded range until a
    // page is already warm or the requested range is large enough to amortize
    // the prefetch.
    let hasWarmPage = false
    for (let pageStart = first; pageStart < last; pageStart += this._sourcePageSize) {
      if (this._sourcePageCache.has(pageStart)) { hasWarmPage = true; break }
    }
    if (!hasWarmPage && end - start < this._sourcePageSize) return this._rawBytes(start, end)
    const result = new Uint8Array(end - start)
    let offset = 0
    for (let pageStart = first; pageStart < last; pageStart += this._sourcePageSize) {
      const pageEnd = Math.min(this._file.size, pageStart + this._sourcePageSize)
      let page = this._sourcePageCache.get(pageStart)
      if (!page) {
        // Preserve the reader's bounded I/O contract even when the cache page
        // is larger than one Blob slice.
        page = await this._readPage(pageStart, pageEnd)
        this._sourcePageCache.set(pageStart, page)
        this._sourcePageCacheBytes += page.byteLength
        if (this._readStats) this._readStats.pageMisses++
      } else {
        this._sourcePageCache.delete(pageStart)
        this._sourcePageCache.set(pageStart, page)
        if (this._readStats) this._readStats.pageHits++
      }
      const from = Math.max(start, pageStart), to = Math.min(end, pageEnd)
      if (to > from) {
        result.set(page.subarray(from - pageStart, to - pageStart), offset)
        offset += to - from
      }
    }
    while (this._sourcePageCacheBytes > this._sourcePageCacheLimit) {
      const oldest = this._sourcePageCache.keys().next().value
      if (oldest == null) break
      const page = this._sourcePageCache.get(oldest)
      this._sourcePageCache.delete(oldest)
      this._sourcePageCacheBytes -= page.byteLength
    }
    return result
  }

  async _range (start, end) {
    const result = new Uint8Array(end - start)
    for (let at = start; at < end; at += this._chunkSize) result.set(await this._bytes(at, Math.min(end, at + this._chunkSize)), at - start)
    return result
  }

  async _checkpoint () {
    abort(this._signal)
    if (this._disposed) throw new Error('STEP reader is disposed')
    // Yield to worker cancellation messages as well as AbortSignal callbacks.
    await new Promise(resolve => setTimeout(resolve, 0))
    abort(this._signal)
    if (this._disposed) throw new Error('STEP reader is disposed')
  }

  async _geometryClosure (ids) {
    const found = new SlotSet(this._index), stack = []
    for (const id of ids) { const slot = this._index.slot(id); if (found.addSlot(slot)) stack.push(slot) }
    let count = 0
    while (stack.length) {
      const slot = stack.pop()
      for (const ref of this._index.refs(slot)) if (found.addSlot(ref)) stack.push(ref)
      if (++count % 65536 === 0) await this._checkpoint()
    }
    return found
  }

  async _indexFile () {
    let state = 'normal', previous = 0, section = 'start', recordStart = 0, parts = [], length = 0
    const consume = (bytes, end) => {
      const rawCode = syntax(bytes)
      if (rawCode.includes('\uFEFF') && !(recordStart === 0 && rawCode.indexOf('\uFEFF') === 0 && rawCode.lastIndexOf('\uFEFF') === 0)) throw new Error('Unexpected BOM outside start of Part21 file')
      let code = (recordStart === 0 ? rawCode.replace(/^\uFEFF/, '') : rawCode).trim()
      if (code[0] !== '#') code = code.toUpperCase()
      const sectionName = /^(ANCHOR|REFERENCE|SIGNATURE|SCOPE|ENDSCOPE|DATA)\b/.exec(code)?.[1]
      if (sectionName && !(sectionName === 'DATA' && section === 'data-start' && code === 'DATA;')) throw new Error(`Unsupported Part21 structure: ${sectionName} section in ${section}`)
      if (section === 'start' && code === 'ISO-10303-21;') section = 'header-start'
      else if (section === 'header-start' && code === 'HEADER;') section = 'header'
      else if (section === 'header' && code === 'ENDSEC;') { section = 'data-start'; this._headerEnd = end } else if (section === 'header') {
        // Validate syntax only; retain original HEADER bytes, not decoded values.
        if (!/^[A-Z_][A-Z_0-9]*\s*\(/i.test(code)) throw new Error('Malformed HEADER record')
        try { entity(bytes, recordStart, end, '#1=' + rawCode) } catch (error) { throw new Error(`Malformed HEADER record: ${error.message}`) }
      } else if (section === 'data-start' && code === 'DATA;') section = 'data'
      else if (section === 'data' && code === 'ENDSEC;') section = 'end'
      else if (section === 'data') {
        const row = this._fastIndex ? fastEntity(bytes, recordStart, end) : entity(bytes, recordStart, end, rawCode)
        this._index.set(row.id, row)
      } else if (section === 'end' && code === 'END-ISO-10303-21;') section = 'done'
      else throw new Error(`Unsupported Part21 structure in ${section}: ${code.slice(0, 48)}; requires one HEADER and one ordinary DATA section`)
      recordStart = end
    }
    this._progress('indexing', 0, this._file.size)
    for (let offset = 0; offset < this._file.size; offset += this._chunkSize) {
      const bytes = await this._bytes(offset, Math.min(this._file.size, offset + this._chunkSize))
      let from = 0
      for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i]
        if (state === 'quote-end') {
          if (c === 39) { state = 'string'; continue }
          state = 'normal'; previous = 0
        } else if (state === 'binary-end') {
          if (c === 34) { state = 'binary'; continue }
          state = 'normal'; previous = 0
        }
        if (state === 'string') { if (c === 39) state = 'quote-end' } else if (state === 'binary') { if (c === 34) state = 'binary-end' } else if (state === 'comment') {
          if (previous === 42 && c === 47) { state = 'normal'; previous = 0 } else previous = c
        } else if (previous === 47 && c === 42) { state = 'comment'; previous = 0 } else if (c === 39) { state = 'string'; previous = 0 } else if (c === 34) { state = 'binary'; previous = 0 } else if (c === 59) {
          const tail = bytes.subarray(from, i + 1)
          length += tail.length
          if (length > 64 * 1024 * 1024) throw new Error('Entity/header record exceeds 64 MiB indexing limit')
          consume(parts.length ? concat([...parts, tail], length) : tail, offset + i + 1)
          parts = []; length = 0; from = i + 1; previous = 0
        } else previous = c
      }
      if (from < bytes.length) { const tail = bytes.slice(from); parts.push(tail); length += tail.length }
      if (length > 64 * 1024 * 1024) throw new Error('Entity/header record exceeds 64 MiB indexing limit')
      this._progress('indexing', offset + bytes.length, this._file.size)
    }
    if (state === 'comment' || state === 'string' || state === 'binary' || syntax(concat(parts, length)).trim() || section !== 'done') throw new Error('Truncated or unterminated Part21 file')
    for (let slot = 0; slot < this._index.slots; slot++) {
      if (!this._index.type(slot)) throw new Error(`Missing reference #${this._index.id(slot)}`)
      if (slot % 262144 === 0) await this._checkpoint()
    }
  }

  _readVisibility () {
    const meshRoots = new Set(), hidden = new Set(), contextual = new Set(), styles = []
    for (const row of this._index.matching(types => types.some(t => ROOT_TYPES.has(t) || t === 'PRESENTATION_STYLE_BY_CONTEXT' || t.startsWith('CONTEXT_DEPENDENT_') || STYLE_TYPES.has(t) || t === 'PRESENTATION_STYLE_ASSIGNMENT'))) {
      if (row.types.some(t => ROOT_TYPES.has(t) && !SET_TYPES.has(t))) meshRoots.add(row.id)
      if (row.types.some(t => t === 'PRESENTATION_STYLE_BY_CONTEXT' || t.startsWith('CONTEXT_DEPENDENT_'))) contextual.add(row.id)
      if (row.styleTarget || row.types.includes('PRESENTATION_STYLE_ASSIGNMENT')) styles.push(row)
    }
    // A plain STYLED_ITEM can still carry an occurrence-scoped style assignment.
    // Propagate that scope through style/override links, not geometry references.
    let changed = true
    while (changed) {
      changed = false
      for (const row of styles) {
        if (!contextual.has(row.id) && row.refs.some(id => contextual.has(id))) { contextual.add(row.id); changed = true }
      }
    }
    for (const row of this._index.matching(types => types.some(t => t.includes('INVISIBILITY')))) {
      if (row.types.length !== 1 || row.types[0] !== 'INVISIBILITY' || !row.items) {
        this.warnings.push(`Visibility limitation: occurrence-scoped or unsupported INVISIBILITY #${row.id}; affected instances remain visible.`)
        continue
      }
      for (const ref of row.items) {
        let target = this._index.get(ref)
        const visited = new Set()
        while (target?.styleTarget && !contextual.has(target.id) && !visited.has(target.id)) {
          visited.add(target.id)
          target = this._index.get(target.styleTarget)
        }
        if (target && meshRoots.has(target.id) && !contextual.has(target.id)) hidden.add(target.id)
        else if (target && target.types.some(t => SET_TYPES.has(t))) { /* auxiliary geometry does not hide a mesh */ } else {
          this.warnings.push(`Visibility limitation: INVISIBILITY #${row.id} target #${ref} is face-only, occurrence-scoped or unsupported; whole-body visibility is not inferred and affected instances remain visible.`)
        }
      }
    }
    this._visibilityInfo = { meshRoots, hidden }
  }

  _jobVisible (ids, canHide = true) {
    if (!this._visibilityInfo) return true // incomplete/invalid index: never guess
    const { meshRoots, hidden } = this._visibilityInfo
    const bodies = ids.filter(id => meshRoots.has(id))
    const hiddenCount = bodies.filter(id => hidden.has(id)).length
    if (hiddenCount && hiddenCount < bodies.length) {
      const warning = 'Visibility limitation: mixed hidden and visible mesh roots share an inseparable job; the job remains visible to avoid hiding unrelated bodies or occurrences.'
      if (!this.warnings.includes(warning)) this.warnings.push(warning)
    } else if (hiddenCount && !canHide) {
      this.warnings.push('Visibility limitation: whole-import fallback may contain unsupported geometry; the job remains visible because complete body visibility cannot be established.')
    }
    return !(canHide && bodies.length && hiddenCount === bodies.length)
  }

  _whole (reason) {
    this.mode = 'whole'
    this.fallbackReason = reason
    const visible = this._jobVisible([...(this._visibilityInfo?.meshRoots || [])], reason.startsWith('Only one independent topology body') || reason === 'All topology roots form one dependent component')
    this.warnings = [...new Set([reason, ...this.warnings])]
    this._plans.clear()
    this._entityCount = this._index.size
    const job = Object.freeze({ id: 'whole', rootIds: Object.freeze([]), entityCount: this._entityCount, estimatedBytes: this._file.size, mode: 'whole', visible })
    this.jobs = Object.freeze([job])
    this._plans.set(job, null)
    this._index.clear()
    this._geometry = this._metadata = this._representations = this._rootIds = this._metadataPlan = null
    this._visibilityInfo = null
  }

  async _plan () {
    // Include auxiliary sets in dependency planning so the grouping below can
    // attach them to their product's topology job. Excluding them here made a
    // normal shape representation containing a datum curve force the entire
    // assembly into one large decode. Unassociated sets still trigger the
    // conservative fallback below; no source geometry is silently dropped.
    const roots = [...this._index.matching(types => types.some(t => ROOT_TYPES.has(t)))].sort((a, b) => a.start - b.start)
    const topologyCount = roots.filter(row => row.types.some(t => ROOT_TYPES.has(t) && !SET_TYPES.has(t))).length
    if (topologyCount < 2) { this._whole(topologyCount ? 'Only one independent topology body; preserve original import' : 'No supported BREP/surface-model roots'); return }
    const rootIds = new Set(roots.map(row => row.id))
    const geometry = await this._geometryClosure(rootIds)
    const representations = [...this._index.extra.keys()].filter(slot => this._index.extra.get(slot).items && !geometry.hasSlot(slot)).map(slot => this._index.row(slot))
    // A wireframe representation is presentation data for the same product,
    // but its geometric set still needs to travel with that product. Include
    // only this presentation type in representation planning; ordinary
    // presentation/style records remain independent metadata.
    const partRepresentations = representations.filter(row => !row.presentation || row.types.some(type => WIREFRAME_TYPES.has(type)))
    const represented = new Set()
    for (const rep of partRepresentations) {
      for (const id of rep.items) {
        if (rootIds.has(id)) represented.add(id)
        else if (!rep.presentation && !this._index.get(id).types.every(t => PLACEMENT_TYPES.has(t) || t === 'MAPPED_ITEM')) throw new Error(`Unsupported shape representation item #${id}; whole import preserves all geometry`)
      }
    }
    if (roots.some(row => !represented.has(row.id))) throw new Error('Topology root is not a direct item of a supported shape representation')
    const metadata = new Set()
    for (let slot = 0; slot < this._index.slots; slot++) {
      if (!geometry.hasSlot(slot)) metadata.add(this._index.id(slot))
      if (slot % 262144 === 0) await this._checkpoint()
    }
    // Unrecognized inverse geometry attachments may affect appearance/visibility.
    // Do not guess their semantics or quietly import an extra detached face.
    for (const id of metadata) {
      const row = this._index.get(id)
      if (row.types.some(t => /SHAPE_REPRESENTATION$/.test(t) && !SHAPE_TYPES.has(t) && !row.presentation && t !== 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')) throw new Error(`Unsupported shape representation #${id} (${row.types.join(',')})`)
      if (row.types.some(t => /TESSELLATED|TRIANGULATED|CSG_SOLID|BOOLEAN_RESULT|SWEPT_AREA_SOLID|EXTRUDED_AREA_SOLID|REVOLVED_AREA_SOLID/.test(t))) throw new Error(`Unsupported additional geometry #${id} (${row.types.join(',')})`)
      if (row.items) continue
      for (const ref of row.refs) {
        if (ref === row.styleTarget) continue
        if (geometry.has(ref) && !this._index.get(ref).types.every(t => PLACEMENT_TYPES.has(t))) throw new Error(`Unsupported inverse geometry dependency #${id} -> #${ref}`)
      }
    }
    this._geometry = geometry
    this._metadata = metadata
    this._representations = representations
    this._rootIds = rootIds
    // Connected roots (e.g. a void brep sharing another root as a dependency) must
    // remain one job. Shared lower-level geometry can be duplicated losslessly.
    const parent = new Map(roots.map(row => [row.id, row.id]))
    const find = id => { let p = id; while (parent.get(p) !== p) p = parent.get(p); return p }
    // Only roots reached by another geometry record can connect body jobs. Most
    // files have no such links; scan compact edges once rather than traversing
    // every body's (possibly heavily shared) geometry before the first output.
    const rootSlots = new Set(roots.map(row => this._index.slot(row.id)))
    let nestedRoots = false
    for (let slot = 0; slot < this._index.slots; slot++) {
      if (geometry.hasSlot(slot)) for (const ref of this._index.refs(slot)) if (rootSlots.has(ref)) { nestedRoots = true; break }
      if (nestedRoots) break
      if (slot % 262144 === 0) await this._checkpoint()
    }
    if (nestedRoots) {
      for (const root of roots) {
        for (const id of closure(this._index, [root.id])) if (rootIds.has(id)) parent.set(find(id), find(root.id))
        await this._checkpoint()
      }
    }
    // Auxiliary geometric sets (often datum curves) travel with their part's
    // solid, never as meshless jobs. Only untransformed representation relations
    // establish this grouping; assembly occurrence transformations stay intact.
    const repParent = new Map(partRepresentations.map(row => [row.id, row.id]))
    const findRep = id => { let p = id; while (repParent.get(p) !== p) p = repParent.get(p); return p }
    for (const row of this._index.matching(types => types.includes('SHAPE_REPRESENTATION_RELATIONSHIP') && !types.includes('REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION'))) {
      const reps = row.refs.filter(id => repParent.has(id))
      for (const id of reps.slice(1)) repParent.set(findRep(id), findRep(reps[0]))
    }
    const repRoots = new Map()
    for (const rep of partRepresentations) {
      const key = findRep(rep.id)
      if (!repRoots.has(key)) repRoots.set(key, [])
      for (const id of rep.items) if (rootIds.has(id)) repRoots.get(key).push(id)
    }
    for (const ids of repRoots.values()) {
      if (ids.some(id => this._index.get(id).types.some(t => SET_TYPES.has(t)))) for (const id of ids) parent.set(find(id), find(ids[0]))
    }
    const groups = new Map()
    for (const root of roots) { const key = find(root.id); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(root.id) }
    for (const ids of groups.values()) if (ids.every(id => this._index.get(id).types.some(t => SET_TYPES.has(t)))) throw new Error('Geometric set has no safely associated topology body; preserve whole import')
    if (groups.size < 2) { this._whole('All topology roots form one dependent component'); return }
    // One conservative omission preflight establishes fallback safety before any
    // job escapes. It also supplies hierarchy data without tessellating a body.
    this._metadataPlan = this._select([])
    let count = 0
    for (const ids of groups.values()) {
      const job = Object.freeze({ id: `body-${count++}`, rootIds: Object.freeze(ids), entityCount: null, estimatedBytes: null, mode: 'partitioned', visible: this._jobVisible(ids) })
      this._plans.set(job, ids)
      this.jobs.push(job)
      this._progress('planning', count, groups.size)
      if (count % 256 === 0) await this._checkpoint()
    }
    abort(this._signal)
    this.mode = 'partitioned'
    this.jobs = Object.freeze(this.jobs)
  }

  _select (ids) {
    const active = closure(this._index, ids), dropped = new Set(), rewrites = new Map()
    const retainedRoots = new Set(ids)
    for (const id of this._metadata) {
      const row = this._index.get(id)
      if (row.styleTarget && this._geometry.has(row.styleTarget) && !active.has(row.styleTarget)) dropped.add(id)
    }
    // Style overrides and inverse presentation assignments follow removed styles.
    // Shape/product/assembly relations are never silently discarded.
    let changed = true
    while (changed) {
      changed = false
      for (const id of this._metadata) {
        if (dropped.has(id)) continue
        const row = this._index.get(id)
        if (row.items) {
          if (row.presentation && row.items.every(ref => dropped.has(ref) || (this._geometry.has(ref) && !active.has(ref)))) { dropped.add(id); changed = true }
        } else if (row.refs.some(ref => dropped.has(ref))) {
          if (!row.types.every(t => STYLE_TYPES.has(t) || /^(PRESENTATION_|INVISIBILITY$)/.test(t))) throw new Error(`Cannot safely filter inverse style dependency #${id}`)
          dropped.add(id); changed = true
        }
      }
    }
    const selected = new Set(), stack = [...this._metadata].filter(id => !dropped.has(id))
    for (const id of ids) stack.push(id)
    while (stack.length) {
      const id = stack.pop()
      if (selected.has(id) || dropped.has(id)) continue
      selected.add(id)
      const row = this._index.get(id)
      if (row.items && this._metadata.has(id)) {
        const items = row.items.filter(ref => !dropped.has(ref) && (!this._rootIds.has(ref) || retainedRoots.has(ref)) && (!row.presentation || !this._geometry.has(ref) || active.has(ref)))
        if (items.length !== row.items.length) rewrites.set(id, items)
        for (const ref of row.nonItemRefs) stack.push(ref)
        for (const ref of items) stack.push(ref)
      } else for (const ref of row.refs) stack.push(ref)
    }
    for (const root of this._rootIds) if (selected.has(root) && !retainedRoots.has(root)) throw new Error('Unrecognized relationship reconnects omitted topology; whole import required')
    return { selected, rewrites }
  }

  async readJob (job) {
    if (this._disposed) throw new Error('STEP reader is disposed')
    if (!this._plans.has(job)) throw new TypeError('Job must be a handle from this reader.jobs')
    abort(this._signal)
    this._readStats = { rawReads: 0, rawReadBytes: 0, pageHits: 0, pageMisses: 0 }
    if (job.mode === 'whole') {
      const bytes = new Uint8Array(this._file.size)
      for (let at = 0; at < bytes.length; at += this._chunkSize) {
        const chunk = await this._bytes(at, Math.min(bytes.length, at + this._chunkSize))
        bytes.set(chunk, at)
        this._progress('reading', at + chunk.length, bytes.length)
      }
      return bytes
    }
    const selectStarted = performance.now()
    const plan = this._select(this._plans.get(job))
    const timings = { selectMs: performance.now() - selectStarted }
    const result = await this._emit(plan, false, 4096, timings)
    this.lastReadTimings = { mode: 'compatibility', ...timings, outputBytes: result.byteLength, ...this._readStats }
    this._readStats = null
    return result
  }

  /** Read-only hierarchy input for importers supporting hierarchyOnly parsing.
   * No topology roots, faces or surfaces reachable only from a body are emitted.
   * Product/representation IDs, assembly uses, transforms, units and HEADER stay
   * original. Whole fallback returns null; it must never masquerade as metadata.
   * No output buffer is cached. rootIds on jobs still identify the real bodies.
   */
  async readMetadata () {
    if (this._disposed) throw new Error('STEP reader is disposed')
    abort(this._signal)
    if (this.mode !== 'partitioned') return null
    this._readStats = { rawReads: 0, rawReadBytes: 0, pageHits: 0, pageMisses: 0 }
    const timings = {}
    const result = await this._emit(this._metadataPlan, true, 4096, timings)
    this.lastReadTimings = { mode: 'metadata', ...timings, outputBytes: result.byteLength, ...this._readStats }
    this._readStats = null
    return result
  }

  // Native conversion shares immutable product/style/unit entities. Unlike the
  // standalone compatibility snippets, these packets are internal: topology
  // references are resolved against the shared map by the native consumer.
  async readNativeMetadata () {
    if (this._disposed) throw new Error('STEP reader is disposed')
    abort(this._signal)
    if (this.mode !== 'partitioned') return null
    this._readStats = { rawReads: 0, rawReadBytes: 0, pageHits: 0, pageMisses: 0 }
    const started = performance.now()
    const selected = new Set(this._metadata)
    for (const id of this._rootIds) selected.add(id)
    // Style targets need their type, not their topology. Placements may share
    // points with geometry; retain their small dependency closure as well.
    for (const id of this._metadata) {
      for (const ref of this._index.get(id).refs) {
        selected.add(ref)
        if (this._index.get(ref).types.every(type => PLACEMENT_TYPES.has(type))) {
          for (const dependency of closure(this._index, [ref])) selected.add(dependency)
        }
      }
    }
    const timings = { selectMs: performance.now() - started }
    const result = await this._emit({ selected, rewrites: new Map() }, false, 65536, timings)
    this.lastReadTimings = { mode: 'native-metadata', ...timings, outputBytes: result.byteLength, selectedRows: selected.size, ...this._readStats }
    this._readStats = null
    return result
  }

  async readNativeJob (job) {
    if (this._disposed) throw new Error('STEP reader is disposed')
    if (!this._plans.has(job)) throw new TypeError('Job must be a handle from this reader.jobs')
    abort(this._signal)
    if (job.mode !== 'partitioned') return this.readJob(job)
    // Native packets resolve shared product/style/unit records through the
    // immutable metadata namespace. Re-emitting that namespace for every job
    // caused large assemblies to spend minutes rebuilding identical packets.
    this._readStats = { rawReads: 0, rawReadBytes: 0, pageHits: 0, pageMisses: 0 }
    const closureStarted = performance.now()
    const selected = closure(this._index, this._plans.get(job))
    const timings = { closureMs: performance.now() - closureStarted }
    const result = await this._emit({ selected, rewrites: new Map() }, false, 65536, timings)
    this.lastReadTimings = { mode: 'native', ...timings, outputBytes: result.byteLength, selectedRows: selected.size, ...this._readStats }
    this._readStats = null
    return result
  }

  async _emit (plan, hierarchyOnly = false, readGap = 4096, timings = {}) {
    const headerStarted = performance.now()
    const parts = [await this._range(0, this._headerEnd), encoder.encode('\nDATA;\n')]
    timings.headerReadMs = performance.now() - headerStarted
    // Fresh IDs need not be numeric JS values. Choose a decimal prefix longer
    // than every source identifier, avoiding collisions even beyond 2^53.
    const base = '1' + '0'.repeat(this._index.maxDigits)
    const placeholder = `${base}1`, origin = `${base}2`
    let needsPlaceholder = false, loaded = 0
    const sortStarted = performance.now()
    const rows = [...plan.selected].map(id => this._index.get(id)).sort((a, b) => a.start - b.start)
    timings.sortMs = performance.now() - sortStarted
    // Coalesce nearby source records, but bound reads by chunkSize. Raw bytes are
    // kept only for this job; snippets do not reconstruct or round STEP numbers.
    let cacheStart = -1, cache = new Uint8Array(0)
    const newline = encoder.encode('\n')
    let rangeReadMs = 0, rewriteMs = 0
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (r % 16384 === 0) await this._checkpoint()
      let bytes
      if (row.start >= cacheStart && row.end <= cacheStart + cache.length) bytes = cache.subarray(row.start - cacheStart, row.end - cacheStart)
      else if (row.end - row.start <= this._chunkSize) {
        cacheStart = row.start
        let end = row.end
        for (let next = r + 1; next < rows.length && rows[next].end - row.start <= this._chunkSize && rows[next].start - end <= readGap; next++) end = rows[next].end
        const rangeStarted = performance.now()
        cache = await this._bytes(row.start, end)
        rangeReadMs += performance.now() - rangeStarted
        bytes = cache.subarray(0, row.end - row.start)
      } else {
        const rangeStarted = performance.now()
        bytes = await this._range(row.start, row.end)
        rangeReadMs += performance.now() - rangeStarted
      }
      if (plan.rewrites.has(row.id)) {
        const rewriteStarted = performance.now()
        const items = plan.rewrites.get(row.id)
        const empty = !items.length && !row.presentation
        if (empty) needsPlaceholder = true
        const list = encoder.encode(`(${empty ? '#' + placeholder : items.map(id => '#' + id).join(',')})`)
        const prefix = empty || (hierarchyOnly && !row.presentation)
          ? concat([bytes.subarray(0, row.typeSpan[0]), encoder.encode('SHAPE_REPRESENTATION'), bytes.subarray(row.typeSpan[1], row.itemSpan[0])])
          : bytes.subarray(0, row.itemSpan[0])
        bytes = concat([prefix, list, bytes.subarray(row.itemSpan[1])])
        rewriteMs += performance.now() - rewriteStarted
      }
      // A row view remains valid after cache is advanced because it retains
      // the source page. Avoid copying every record before final assembly.
      parts.push(bytes, newline)
      loaded += row.end - row.start
    }
    if (needsPlaceholder) parts.push(encoder.encode(`#${origin}=CARTESIAN_POINT('',(0.,0.,0.));\n#${placeholder}=AXIS2_PLACEMENT_3D('',#${origin},$,$);\n`))
    parts.push(encoder.encode('ENDSEC;\nEND-ISO-10303-21;\n'))
    abort(this._signal)
    this._progress('reading', loaded, loaded)
    abort(this._signal)
    const assembleStarted = performance.now()
    const result = concat(parts)
    timings.rangeReadMs = rangeReadMs
    timings.rewriteMs = rewriteMs
    timings.assembleMs = performance.now() - assembleStarted
    timings.sourceBytes = loaded
    timings.rows = rows.length
    return result
  }

  dispose () {
    this._disposed = true
    this._file = null
    this._index.clear()
    this._plans.clear()
    this._geometry = this._metadata = this._representations = this._rootIds = this._metadataPlan = null
    this._visibilityInfo = null
    this._sourcePageCache.clear()
    this._sourcePageCacheBytes = 0
    this._readStats = null
    this.lastReadTimings = null
    this._onProgress = null
  }
}

export default StepPart21Reader
