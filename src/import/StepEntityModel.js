// Geometry-job parameter decoder. References remain decimal strings so large
// Part21 IDs never pass through floating-point numbers. No regex statement split:
// semicolons, hashes and parentheses inside strings/comments are data.
export class StepUnsupported extends Error {
  constructor (message) { super(message); this.name = 'StepUnsupported' }
}

export const refId = value => value?.ref
export const isType = (entity, type) => !!entity?.parts[type]
export const args = (entity, type) => entity?.parts[type]

// Native metadata/body packets intentionally carry references into one another.
// Enable validateReferences for a standalone file, or validate the merged Map.
export function decodeStepEntities (bytes, { validateReferences = false } = {}) {
  const text = new TextDecoder().decode(bytes), entities = new Map(), header = []
  let at = 0
  const error = message => { throw new StepUnsupported(`${message} near character ${at}`) }
  const skip = () => {
    while (at < text.length) {
      if (text[at] === '\uFEFF') error('Unexpected BOM outside start of STEP file')
      if (/\s/.test(text[at])) { at++; continue }
      if (text.slice(at, at + 2) !== '/*') break
      const end = text.indexOf('*/', at + 2)
      if (end < 0) error('Unterminated STEP comment')
      at = end + 2
    }
  }
  const expect = value => { skip(); if (text[at++] !== value) error(`Expected ${value}`) }
  const word = () => {
    skip()
    const match = /^[A-Z_][A-Z_0-9]*/i.exec(text.slice(at))
    if (!match) error('Expected entity/type name')
    at += match[0].length; return match[0].toUpperCase()
  }
  const id = () => {
    expect('#'); skip()
    const match = /^\d+/.exec(text.slice(at))
    if (!match) error('Expected entity ID')
    at += match[0].length; return match[0].replace(/^0+/, '') || '0'
  }
  const string = () => {
    expect("'")
    let out = '', closed = false
    while (at < text.length) {
      const char = text[at++]
      if (char === "'") {
        if (text[at] === "'") { out += "'"; at++; continue }
        closed = true; break
      }
      if (char !== '\\') { out += char; continue }
      if (text[at] === '\\') { out += '\\'; at++; continue }
      const directive = text.slice(at, at + 3).toUpperCase()
      if (directive === 'PA\\') { at += 3; continue }
      if (/^P[B-I]\\$/.test(directive)) error(`Unsupported STEP legacy code page ${directive[1]}`)
      if (text.slice(at, at + 2).toUpperCase() === 'S\\') {
        at += 2
        const code = text.charCodeAt(at++)
        if (!(code >= 32 && code <= 126)) error('Malformed STEP shifted character')
        out += String.fromCharCode(code + 128); continue
      }
      if (text.slice(at, at + 2).toUpperCase() === 'X\\') {
        at += 2
        const hex = text.slice(at, at + 2)
        if (!/^[0-9A-F]{2}$/i.test(hex)) error('Malformed STEP hex escape')
        out += String.fromCharCode(parseInt(hex, 16)); at += 2; continue
      }
      if (directive === 'X2\\' || directive === 'X4\\') {
        at += 3
        const terminator = /\\X0\\/gi
        terminator.lastIndex = at
        const end = terminator.exec(text)?.index ?? -1
        if (end < 0) error('Unterminated STEP Unicode escape')
        const hex = text.slice(at, end), width = directive === 'X2\\' ? 4 : 8
        if (!hex.length || hex.length % width || !/^[0-9A-F]+$/i.test(hex)) error('Malformed STEP Unicode escape')
        let decoded = ''
        for (let i = 0; i < hex.length; i += width) {
          const cp = parseInt(hex.slice(i, i + width), 16)
          if (cp > 0x10ffff || (width === 8 && cp >= 0xd800 && cp <= 0xdfff)) error('Invalid STEP Unicode code point')
          decoded += String.fromCodePoint(cp)
        }
        // X2 is UTF-16: reject unpaired surrogates, preserve valid pairs.
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(decoded)) error('Invalid STEP Unicode surrogate')
        out += decoded; at = end + 4; continue
      }
      error('Unsupported STEP string control sequence')
    }
    if (!closed) error('Unterminated string')
    return out
  }
  const list = depth => {
    if (depth > 64) error('Excessively nested STEP parameters')
    expect('('); skip()
    const values = []
    if (text[at] !== ')') {
      do { values.push(value(depth + 1)); skip(); if (text[at] !== ',') break; at++ } while (at < text.length)
    }
    expect(')'); return values
  }
  const value = depth => {
    skip()
    const c = text[at]
    if (c === '#') return { ref: id() }
    if (c === "'") return string()
    if (c === '(') return list(depth)
    if (c === '$' || c === '*') { at++; return null }
    const enumeration = /^\.[A-Z_][A-Z_0-9]*\./i.exec(text.slice(at))
    if (enumeration) { at += enumeration[0].length; return enumeration[0].toUpperCase() }
    const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[ED][+-]?\d+)?/i.exec(text.slice(at))
    if (number) {
      at += number[0].length
      const n = Number(number[0].replace(/D/i, 'E'))
      if (!Number.isFinite(n)) error('Non-finite number')
      return n
    }
    if (c === '"') {
      at++
      const end = text.indexOf('"', at), raw = text.slice(at, end)
      if (end < 0 || !/^[0-3][0-9A-F]*$/i.test(raw)) error('Malformed STEP binary literal')
      const unusedBits = Number(raw[0]), binary = raw.slice(1).toUpperCase()
      if (unusedBits && (!binary.length || (parseInt(binary.at(-1), 16) & ((1 << unusedBits) - 1)))) error('Invalid STEP binary padding')
      at = end + 1; return { binary, unusedBits }
    }
    if (c === '@') error('Unsupported external STEP reference @')
    if (c === '!') error('Unsupported user-defined STEP type')
    const type = word()
    return { type, values: list(depth) }
  }
  // Read HEADER structurally, so a quoted "DATA;" cannot start entity parsing.
  skip()
  if (text.slice(at, at + 'ISO-10303-21;'.length).toUpperCase() !== 'ISO-10303-21;') {
    error('Expected ISO-10303-21 header')
  }
  at += 'ISO-10303-21;'.length
  if (word() !== 'HEADER') error('Expected HEADER')
  expect(';')
  while (true) {
    const type = word()
    if (type === 'ENDSEC') { expect(';'); break }
    if (['HEADER', 'DATA', 'ANCHOR', 'REFERENCE', 'SIGNATURE'].includes(type)) error(`Unexpected STEP section ${type} inside HEADER`)
    header.push({ type, values: list(0) }); expect(';')
  }
  const dataSection = word()
  if (dataSection !== 'DATA') error(`Unsupported STEP section ${dataSection}; expected ordinary DATA`)
  skip()
  if (text[at] === '(') error('Unsupported parameterized DATA section')
  expect(';')
  while (true) {
    skip()
    if (text[at] !== '#') break
    const key = id(), parts = Object.create(null)
    expect('='); skip()
    const complex = text[at] === '('
    if (complex) at++
    do {
      const type = word()
      if (parts[type]) error('Duplicate complex entity component')
      parts[type] = list(0); skip()
      if (!complex) break
    } while (text[at] !== ')')
    if (complex) expect(')')
    expect(';')
    if (entities.has(key)) error(`Duplicate #${key}`)
    entities.set(key, { id: key, parts, complex })
  }
  const dataEnd = word()
  if (dataEnd !== 'ENDSEC') error(`Unexpected STEP section/record ${dataEnd} inside DATA`)
  expect(';'); skip()
  const terminator = 'END-ISO-10303-21'
  if (text.slice(at, at + terminator.length).toUpperCase() !== terminator) error(`Unsupported additional STEP section ${text.slice(at).match(/^[A-Z_]+/i)?.[0] || '(malformed)'}`)
  at += terminator.length; expect(';'); skip()
  if (at !== text.length) error(`Unsupported trailing STEP section/content ${text.slice(at).match(/^[A-Z_]+/i)?.[0] || '(malformed)'}`)
  if (validateReferences) validateStepReferences(entities)
  const declarations = header.filter(record => record.type === 'FILE_SCHEMA')
  if (declarations.length > 1) error('Duplicate FILE_SCHEMA declaration')
  const schemas = declarations[0]?.values[0] || []
  if (declarations.length && (declarations[0].values.length !== 1 || !Array.isArray(schemas) || !schemas.length || schemas.some(s => typeof s !== 'string' || !s.trim()))) error('Malformed FILE_SCHEMA declaration')
  const diagnostics = []
  if (!schemas.length) diagnostics.push({ code: 'MISSING_SCHEMA', message: 'No FILE_SCHEMA declared; generic entity decoding only' })
  for (const schema of schemas) {
    if (!/^(?:CONFIG_CONTROL_DESIGN|AUTOMOTIVE_DESIGN|AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_OF_MECHANICAL_PARTS_AND_ASSEMBLIES|AP242_MANAGED_MODEL_BASED_3D_ENGINEERING)(?:\s*\{[^}]*\})?$/i.test(schema.trim())) diagnostics.push({ code: 'UNKNOWN_SCHEMA', schema, message: `Unrecognized schema ${schema}; generic entity decoding only` })
  }
  // Preserve the Map API used by geometry callers. Recognized schema names do
  // not imply EXPRESS validation or complete application-protocol support.
  Object.defineProperties(entities, { header: { value: header }, schemas: { value: schemas }, diagnostics: { value: diagnostics } })
  return entities
}

// Two phases: forward references are legal, dangling references anywhere in a
// nested aggregate/typed parameter are not. No retained reverse-edge graph.
export function validateStepReferences (entities) {
  for (const entity of entities.values()) {
    const pending = Object.values(entity.parts).slice()
    while (pending.length) {
      const item = pending.pop()
      if (Array.isArray(item)) { for (const child of item) pending.push(child) }
      else if (item?.ref && !entities.has(item.ref)) throw new StepUnsupported(`Missing STEP entity #${item.ref} referenced by #${entity.id}`)
      else if (item?.values) pending.push(item.values)
    }
  }
}

export function resolveEntity (entities, reference) {
  const id = typeof reference === 'string' ? reference : refId(reference)
  const entity = entities.get(id)
  if (!entity) throw new StepUnsupported(`Missing STEP entity #${id || '?'}`)
  return entity
}
