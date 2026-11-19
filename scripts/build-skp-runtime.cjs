/* eslint-env node */
// Rebuild only the MIT parser and ISC triangulator; no native SDK or plugin.
// npm install --prefix .tmp/skp-runtime-build --ignore-scripts openskp@1.5.0 earcut@3.2.4 fflate@0.8.3 esbuild@0.25.12
// node scripts/build-skp-runtime.cjs .tmp/skp-runtime-build
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const dependencies = path.resolve(process.argv[2] || '.tmp/skp-runtime-build', 'node_modules')
for (const [name, version] of Object.entries({ openskp: '1.5.0', earcut: '3.2.4', fflate: '0.8.3', esbuild: '0.25.12' })) {
  if (JSON.parse(fs.readFileSync(path.join(dependencies, name, 'package.json'))).version !== version) throw Error(`Expected ${name}@${version}`)
}
let source = fs.readFileSync(path.join(dependencies, 'openskp/dist/index.mjs'), 'utf8')
const upstreamHash = crypto.createHash('sha256').update(source).digest('hex')
function patch (from, to) {
  if (source.split(from).length !== 2) throw Error('OpenSKP patch mismatch: ' + from)
  source = source.replace(from, to)
}
// Geometry lists can contain millions of entities in one component. Decode
// one entity at a time instead of retaining its complete recursive TLV tree.
patch('function parseTlvRecursive(data, start, end, containerTags = CONTAINER_TAGS, depth = 0) {', `
function geometryChildren(data, start, end, containerTags, depth) {
  let length = 0;
  for (let pos = start; pos + 6 <= end;) {
    const next = pos + 6 + readU32(data, pos + 2);
    if (next > end) break;
    length++; pos = next;
  }
  return {
    length,
    *[Symbol.iterator]() {
      for (let pos = start; pos + 6 <= end;) {
        const next = pos + 6 + readU32(data, pos + 2);
        if (next > end) break;
        yield parseTlvRecursive(data, pos, next, containerTags, depth)[0];
        pos = next;
      }
    },
    find(predicate) { for (const node of this) if (predicate(node)) return node; }
  };
}
function parseTlvRecursive(data, start, end, containerTags = CONTAINER_TAGS, depth = 0) {`)
patch('children = parseTlvRecursive(\n        data,', 'children = (size > 65536 && ["8913", "8A13", "8B13"].includes(tagHex) ? geometryChildren : parseTlvRecursive)(\n        data,')
// Geometry entities cannot contain document-level material/tag definitions or
// nested component definitions. Do not repeatedly decode them for metadata.
for (const signature of [
  'function collectLayers(nodes, layerIdToName = /* @__PURE__ */ new Map(), options, layerHidden) {',
  'function collectDefs(nodes, defsDict = /* @__PURE__ */ new Map(), options) {',
  '  function collectMaterialIds(nodes) {'
]) {
  const prefix = signature + '\n' + (signature.startsWith('  ') ? '    ' : '  ') + 'for (const el of nodes) {'
  patch(prefix, prefix + '\n      if (["8913", "8A13", "8B13"].includes(el.tag)) continue;')
}
// PandaUI does not consume saved scenes or annotations. Their global vertex
// lookup duplicates every coordinate and their scans revisit all geometry.
patch('      scanVertexPositions(el, vertexPositions);\n      scanInstanceTransforms(el, instanceWorld);\n      if (pageNode === null) {', '      if (!options?.displayOnly) { scanVertexPositions(el, vertexPositions); scanInstanceTransforms(el, instanceWorld); }\n      if (!options?.displayOnly && pageNode === null) {')
patch('dimensions: parseDimensions(modelData, vertexPositions, instanceWorld),', 'dimensions: options?.displayOnly ? [] : parseDimensions(modelData, vertexPositions, instanceWorld),')
patch('const defn = buildDefinition(typeof id === "number" ? id : 0, d, layerIdToName);', 'const defn = buildDefinition(typeof id === "number" ? id : 0, d, layerIdToName);\n    defsDict.delete(id);')
patch('Array.from(d.builder.vertices.entries()).map(', 'Array.from(d.builder.vertices.entries(), ')
patch('Array.from(d.builder.edges.entries()).map(', 'Array.from(d.builder.edges.entries(), ')
patch('Array.from(d.builder.faces.entries()).map(', 'Array.from(d.builder.faces.entries(), ')
// In display-only mode retain compact byte ranges until their occurrence is
// pulled. Parsing all definitions before displaying the first one duplicates
// millions of vertices/edges/faces unnecessarily.
patch('    const tag = el.tag;\n    if (tag === "C409") {', `    const tag = el.tag;
    if (options?.deferGeometry && ["8913", "8A13", "8B13"].includes(tag)) {
      if (el.children.length) (builder.geometryNodes ||= []).push(el);
      continue;
    }
    if (tag === "C409") {`)
patch('  const defsDict = /* @__PURE__ */ new Map();\n  const rootBuilder = new GeometryBuilder();', '  if (options?.displayOnly) options = { ...options, deferGeometry: true };\n  const defsDict = /* @__PURE__ */ new Map();\n  const rootBuilder = new GeometryBuilder();')
patch('    id,\n    guid: d.guid,\n    name: d.name,\n    vertices,', `    id,
    hasGeometry: !!d.builder.geometryNodes?.length,
    loadGeometry: d.builder.geometryNodes?.length ? function () {
      const builder = new GeometryBuilder();
      for (const node of d.builder.geometryNodes) extractGeometryFromNodes([node], builder);
      const geometry = buildDefinition(id, { ...d, builder }, layerIdToName);
      this.vertices = geometry.vertices; this.edges = geometry.edges; this.faces = geometry.faces;
      d.builder.geometryNodes = null;
      this.loadGeometry = null;
    } : null,
    guid: d.guid,
    name: d.name,
    vertices,`)
// Carry drawable tag ids through both decoders. Upstream already decodes D207
// for instances; apply the same drawbase field to edges and faces.
patch('builder.edges.set(eId, [v1, v2]);', `builder.edges.set(eId, [v1, v2]);
        const edgeDrawbase = el.children.find(c => c.tag === "D007");
        const edgeTag = edgeDrawbase?.children.find(c => c.tag === "D207");
        (builder.edgeLayers ||= new Map()).set(eId, edgeTag ? parseVarInt(edgeTag.payload, 0, edgeTag.payload.length) : null);`)
patch('hidden: faceHidden\n', `hidden: faceHidden,
          layerId: (() => { const p = d007?.children.find(c => c.tag === "D207")?.payload; return p ? parseVarInt(p, 0, p.length) : null; })()
`)
patch('builder.edges.set(slot, [v1, v2]);', 'builder.edges.set(slot, [v1, v2]);\n  (builder.edgeLayers ||= new Map()).set(slot, e.db?.layer ?? null);')
patch('hidden: Boolean(v.db.hidden)\n', 'hidden: Boolean(v.db.hidden),\n        layerId: v.db.layer ?? null\n')
patch('curveId: d.builder.edgeCurves?.get(eId) ?? null', 'curveId: d.builder.edgeCurves?.get(eId) ?? null,\n      layer: layerIdToName?.get(d.builder.edgeLayers?.get(eId)) ?? ""')
patch('hidden: fData.hidden ?? false\n', 'hidden: fData.hidden ?? false,\n    layer: layerIdToName?.get(fData.layerId) ?? ""\n')
// Layer visibility in VFF is known independently of color-by-layer materials.
patch('const finalLayersList = Array.from(layerColors.entries())', 'for (const name of layerIdToName.values()) if (!layerColors.has(name)) layerColors.set(name, [136, 136, 136]);\n  const finalLayersList = Array.from(layerColors.entries())')
const output = path.join(root, 'public/shared/skp')
fs.mkdirSync(output, { recursive: true })
require(path.join(dependencies, 'esbuild')).build({
  stdin: { contents: 'export { parseSkp, faceUvBasis, computeFaceUv } from "pandaui-skp-decoder"; export { default as triangulate, deviation } from "earcut";', resolveDir: path.dirname(dependencies), sourcefile: 'skp-entry.js' },
  plugins: [{ name: 'reviewed-openskp-patch', setup (build) {
    build.onResolve({ filter: /^pandaui-skp-decoder$/ }, () => ({ path: 'decoder', namespace: 'patched' }))
    build.onLoad({ filter: /.*/, namespace: 'patched' }, () => ({ contents: source, resolveDir: path.dirname(dependencies), loader: 'js' }))
  } }],
  bundle: true, platform: 'browser', format: 'iife', globalName: 'PandaSkp', target: 'es2020', minify: true,
  outfile: path.join(output, 'PandaSkp.js'),
  banner: { js: '/*! OpenSKP 1.5.0 (MIT), earcut 3.2.4 (ISC), fflate 0.8.3 (MIT). See NOTICES.txt. PandaUI tag-visibility patches; upstream SHA256 ' + upstreamHash + ' */' }
}).then(() => console.log('Built public/shared/skp/PandaSkp.js')).catch(error => { console.error(error); process.exitCode = 1 })
