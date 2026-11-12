// One catalog drives menus, drag/drop validation and frontend dispatch.
export const SCENE_EXTENSIONS = ['glb', 'gltf', 'fbx', '3ds', 'dae', '3mf', 'amf', 'vtk', 'vtp', 'pcd', 'xyz', 'off', 'wrl', 'vrml']
const types = [
  ['3dm', 'Rhino 3DM', ['3dm']],
  ['step', 'STEP', ['stp', 'step']],
  ['iges', 'IGES', ['igs', 'iges']],
  ['brep', 'OpenCascade BREP', ['brep']],
  ['dxf', 'AutoCAD DXF (ASCII)', ['dxf']],
  ['gltf', 'glTF / GLB', ['gltf', 'glb']],
  ['fbx', 'Autodesk FBX', ['fbx']],
  ['3ds', '3D Studio', ['3ds']],
  ['dae', 'COLLADA', ['dae']],
  ['3mf', '3D Manufacturing', ['3mf']],
  ['amf', 'Additive Manufacturing', ['amf']],
  ['vtk', 'VTK / VTP', ['vtk', 'vtp']],
  ['pcd', 'Point Cloud', ['pcd']],
  ['xyz', 'XYZ points', ['xyz']],
  ['off', 'Object File Format', ['off']],
  ['wrl', 'VRML 2', ['wrl', 'vrml']],
  ['obj', 'Wavefront OBJ', ['obj']],
  ['stl', 'STL mesh', ['stl']],
  ['ply', 'Polygon file', ['ply']],
  ['drc', 'Draco mesh', ['drc']],
  ['dwg', 'AutoCAD DWG (Backend)', ['dwg']],
  ['skp', 'SketchUp (Backend)', ['skp']]
]
export const MODEL_FILE_TYPES = types.map(([id, label, suffixes]) => {
  const extensions = suffixes.map(value => '.' + value)
  return { id, label, extensions, accept: extensions.join(','), icon: 'view_in_ar' }
})
export const FRONTEND_EXTENSIONS = MODEL_FILE_TYPES.flatMap(type => ['dwg', 'skp'].includes(type.id) ? [] : type.extensions)
export const BACKEND_EXTENSIONS = ['.3dm', '.stp', '.step', '.skp', '.dwg', '.dxf']
export const modelFileExtension = file => '.' + String(file?.name || '').split('.').pop().toLowerCase()
export const SIDECAR_ACCEPT = '.bin,.mtl,.png,.jpg,.jpeg,.webp,.bmp,.tga,.dds,.gif,.ktx,.ktx2'

export function selectModelFiles (files) {
  const selected = Array.from(files || [])
  const models = selected.filter(file => MODEL_FILE_TYPES.some(type => type.extensions.includes(modelFileExtension(file))))
  if (models.length !== 1) throw new Error('Select one model file, optionally with its resource files (for example .gltf + .bin).')
  return { file: models[0], files: selected.filter(file => file !== models[0]) }
}
