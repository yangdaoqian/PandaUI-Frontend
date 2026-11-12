import * as THREE from 'three'
import schema from '../../public/editor/shared/MaterialSchema'

const states = new WeakMap()
// r120 transmission is an alpha stub. Replace it with a bounded screen-space
// refraction pass; retain native PBR reflection, lights, bump and normal mapping.
export function applyMaterialSurface (material) {
  const settings = material.userData.pandaSurface
  if (!settings || !material.isMeshPhysicalMaterial) return null
  let uniforms = states.get(material)
  if (!uniforms) {
    uniforms = { pandaScene: { value: null },
      pandaSceneReady: { value: 0 },
      pandaProjection: { value: new THREE.Matrix4() },
      pandaIOR: { value: 1.5 },
      pandaReflection: { value: 1 },
      pandaThickness: { value: 1 },
      pandaBlur: { value: 0 },
      pandaFog: { value: new THREE.Color(1, 1, 1) },
      pandaFogDistance: { value: 10 } }
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = `uniform sampler2D pandaScene;
uniform float pandaSceneReady, pandaIOR, pandaReflection, pandaThickness, pandaBlur, pandaFogDistance;
uniform vec3 pandaFog;
uniform mat4 pandaProjection;
` + shader.fragmentShader
      // Match executable GLSL: the installed Three bundle strips comments.
      const alphaStub = /#ifdef TRANSMISSION\s+diffuseColor\.a\s*\*=[\s\S]*?#endif/
      if (!alphaStub.test(shader.fragmentShader)) throw new Error('Unsupported physical shader: transmission block missing.')
      shader.fragmentShader = shader.fragmentShader.replace(alphaStub, `
        vec3 specular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        outgoingLight -= specular * (1.0 - pandaReflection);
        if (totalTransmission > 0.0) {
          vec3 incident = normalize(-vViewPosition);
          vec3 ray = refract(incident, normal, 1.0 / pandaIOR);
          vec3 transmitted = vec3(0.0);
          if (pandaSceneReady > 0.5) {
            vec4 projected = pandaProjection * vec4(-vViewPosition + ray * pandaThickness, 1.0);
            vec2 uv = clamp(projected.xy / max(projected.w, 0.00001) * 0.5 + 0.5, 0.002, 0.998);
            vec2 blur = vec2(pandaBlur * 0.035);
            transmitted = texture2D(pandaScene, uv).rgb * 0.4;
            transmitted += texture2D(pandaScene, clamp(uv + vec2(blur.x, 0.0), 0.002, 0.998)).rgb * 0.15;
            transmitted += texture2D(pandaScene, clamp(uv - vec2(blur.x, 0.0), 0.002, 0.998)).rgb * 0.15;
            transmitted += texture2D(pandaScene, clamp(uv + vec2(0.0, blur.y), 0.002, 0.998)).rgb * 0.15;
            transmitted += texture2D(pandaScene, clamp(uv - vec2(0.0, blur.y), 0.002, 0.998)).rgb * 0.15;
          } else {
            #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
              transmitted = textureCubeUV(envMap, inverseTransformDirection(ray, viewMatrix), pandaBlur).rgb * envMapIntensity;
            #endif
          }
          float f0 = pow((pandaIOR - 1.0) / (pandaIOR + 1.0), 2.0);
          float fresnel = (f0 + (1.0 - f0) * pow(1.0 - saturate(dot(-incident, normal)), 5.0)) * pandaReflection;
          transmitted *= pow(max(pandaFog, vec3(0.0001)), vec3(pandaThickness / max(pandaFogDistance, 0.0001)));
          vec3 diffuseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          outgoingLight = mix(diffuseLight, transmitted * (1.0 - fresnel), totalTransmission) + specular * pandaReflection + totalEmissiveRadiance;
        }
      `)
    }
    material.customProgramCacheKey = () => cacheKey + ':panda-surface-v1'
    states.set(material, uniforms)
    material.needsUpdate = true
  }
  uniforms.pandaIOR.value = settings.ior ?? 1.5
  uniforms.pandaReflection.value = settings.reflection ?? 1
  uniforms.pandaThickness.value = settings.thickness ?? 1
  uniforms.pandaBlur.value = settings.refractionRoughness ?? 0
  uniforms.pandaFog.value.set(settings.refractionColor || '#ffffff').convertSRGBToLinear()
  uniforms.pandaFogDistance.value = settings.attenuationDistance ?? 10
  return uniforms
}

export function setSurfaceSettings (material, patch) {
  patch = Object.fromEntries(Object.entries(patch).filter(([key]) => Object.hasOwn(schema.defaults, key)))
  for (const [key, bounds] of Object.entries(schema.ranges)) {
    if (!(key in patch)) continue
    if (!Number.isFinite(patch[key])) throw new Error('Invalid material ' + key)
    patch[key] = Math.max(bounds[0], Math.min(bounds[1], patch[key]))
  }
  for (const key of schema.colors) if (key in patch && !/^#[\da-f]{6}$/i.test(patch[key])) throw new Error('Invalid material color.')
  if ('materialType' in patch && !Object.hasOwn(schema.types, patch.materialType)) throw new Error('Unknown material type.')
  const settings = material.userData.pandaSurface = { ...(material.userData.pandaSurface || {}), ...patch }
  for (const key of ['roughness', 'metalness', 'opacity', 'clearcoat', 'clearcoatRoughness', 'emissiveIntensity', 'transmission', 'bumpScale']) if (key in patch) material[key] = patch[key]
  for (const key of ['color', 'emissive']) if (key in patch) material[key].set(patch[key]).convertSRGBToLinear()
  if ('normalScale' in patch) material.normalScale.setScalar(patch.normalScale)
  if ('ior' in patch) material.reflectivity = (patch.ior - 1) / (patch.ior + 1) / 0.4
  material.transparent = material.opacity < 1 || !!material.alphaMap || material.transmission > 0
  material.depthWrite = !material.transparent
  if (material.userData.pandauiPhysicalBase) {
    for (const key of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'reflectivity']) material.userData.pandauiPhysicalBase[key] = material[key]
  }
  applyMaterialSurface(material)
  material.needsUpdate = true
  return settings
}

export function surfaceSettings (material, hex) {
  const base = material.userData.pandauiPhysicalBase || material
  const reflection = base.reflectivity ?? 0.5
  const saved = material.userData.pandaSurface || {}
  const inferred = material.transmission > 0 ? 'glass' : base.metalness > 0.8 ? 'metal' : base.clearcoat > 0 ? 'coated' : material.emissive?.getHex() > 0 ? 'emissive' : 'generic'
  return { ...schema.defaults,
    ...saved,
    materialType: saved.materialType || inferred,
    color: hex(material.color),
    emissive: hex(material.emissive),
    roughness: base.roughness,
    metalness: base.metalness,
    opacity: material.opacity,
    clearcoat: base.clearcoat || 0,
    clearcoatRoughness: base.clearcoatRoughness ?? 0.1,
    emissiveIntensity: material.emissiveIntensity,
    transmission: material.transmission || 0,
    bumpScale: material.bumpScale ?? 1,
    normalScale: material.normalScale?.x ?? 1,
    ior: saved.ior ?? (1 + reflection * 0.4) / (1 - reflection * 0.4) }
}
