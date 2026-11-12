(function (root) {
  'use strict'
  var defaults = { materialType: 'generic', color: '#cccccc', roughness: 0.5, metalness: 0, opacity: 1, reflection: 1, ior: 1.5, transmission: 0, refractionRoughness: 0, thickness: 1, refractionColor: '#ffffff', attenuationDistance: 10, bumpScale: 1, normalScale: 1, clearcoat: 0, clearcoatRoughness: 0.1, emissive: '#000000', emissiveIntensity: 1 }
  var types = {
    generic: { label: 'Generic · PBR', values: {} },
    metal: { label: 'Metal', values: { color: '#bfc3c7', metalness: 1, roughness: 0.2 } },
    glass: { label: 'Glass', values: { color: '#ffffff', roughness: 0.05, transmission: 1, ior: 1.52 } },
    plastic: { label: 'Plastic', values: { roughness: 0.25, ior: 1.46 } },
    coated: { label: 'Coated / Car paint', values: { color: '#285a9c', metalness: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 } },
    emissive: { label: 'Emissive', values: { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 3 } }
  }
  var ranges = { roughness: [0, 1], metalness: [0, 1], opacity: [0, 1], reflection: [0, 1], ior: [1, 7 / 3], transmission: [0, 1], refractionRoughness: [0, 1], thickness: [0, 1000000], attenuationDistance: [0.0001, 1000000], bumpScale: [-1000, 1000], normalScale: [0, 100], clearcoat: [0, 1], clearcoatRoughness: [0, 1], emissiveIntensity: [0, 100] }
  var groups = [
    { label: 'Base', fields: [['Color', 'color'], ['Opacity', 'opacity']] },
    { label: 'Reflection', fields: [['Reflection amount', 'reflection'], ['Roughness', 'roughness'], ['Metalness', 'metalness'], ['Fresnel IOR', 'ior']], exclude: ['emissive'] },
    { label: 'Refraction', fields: [['Transmission', 'transmission'], ['Refraction roughness', 'refractionRoughness'], ['Thickness (model units)', 'thickness'], ['Fog color', 'refractionColor'], ['Fog distance (model units)', 'attenuationDistance']], only: ['generic', 'glass'] },
    { label: 'Coat', fields: [['Coat amount', 'clearcoat'], ['Coat roughness', 'clearcoatRoughness']], only: ['generic', 'coated'] },
    { label: 'Bump / Normal', fields: [['Bump strength', 'bumpScale'], ['Normal strength', 'normalScale']], exclude: ['emissive'] },
    { label: 'Emission', fields: [['Emissive color', 'emissive'], ['Emission intensity', 'emissiveIntensity']], only: ['generic', 'emissive'] }
  ]
  var api = { defaults: defaults, types: types, ranges: ranges, colors: ['color', 'emissive', 'refractionColor'], groups: groups,
    textures: { texture: { slot: 'map', label: 'Color', srgb: true }, bumpTexture: { slot: 'bumpMap', label: 'Bump' }, normalTexture: { slot: 'normalMap', label: 'Normal' } } }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUIMaterialSchema = api
})(typeof window === 'object' ? window : globalThis)
