import * as THREE from 'three'

const materials = new Set()
const textures = new Map()
const settings = { size: 8, shape: 'square' }
const shapes = ['square', 'circle', 'cross', 'diamond']

function pointTexture (shape) {
  if (shape === 'square') return null
  if (textures.has(shape)) return textures.get(shape)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  if (shape === 'circle') {
    context.beginPath()
    context.arc(32, 32, 31, 0, Math.PI * 2)
    context.fill()
  } else if (shape === 'cross') {
    context.fillRect(25, 0, 14, 64)
    context.fillRect(0, 25, 64, 14)
  } else {
    context.beginPath()
    context.moveTo(32, 0)
    context.lineTo(64, 32)
    context.lineTo(32, 64)
    context.lineTo(0, 32)
    context.closePath()
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  textures.set(shape, texture)
  return texture
}

function applySettings (material) {
  const map = pointTexture(settings.shape)
  if (material.map !== map) {
    material.map = map
    material.needsUpdate = true
  }
  material.size = settings.size
  material.sizeAttenuation = false
  material.alphaTest = Math.max(0.000001, material.opacity * 0.5)
}

export function createPointMaterial (options = {}) {
  const material = new THREE.PointsMaterial({ ...options, sizeAttenuation: false })
  applySettings(material)
  materials.add(material)
  material.addEventListener('dispose', () => {
    materials.delete(material)
    if (materials.size === 0) {
      textures.forEach(texture => texture.dispose())
      textures.clear()
    }
  })
  return material
}

export function setPointDisplaySettings (value = {}) {
  const previous = { ...settings }
  if (value.size != null && Number.isFinite(Number(value.size))) settings.size = Math.min(64, Math.max(1, Math.round(Number(value.size))))
  if (shapes.includes(value.shape)) settings.shape = value.shape
  if (settings.size !== previous.size || settings.shape !== previous.shape) materials.forEach(applySettings)
  return { ...settings }
}
