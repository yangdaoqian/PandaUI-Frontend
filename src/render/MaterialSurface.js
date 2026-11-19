import * as THREE from 'three'
import schema from '../../public/editor/shared/MaterialSchema'

const states = new WeakMap()
const reflectionStates = new WeakMap()
const programs = new WeakMap()

// Only our own, unchanged shader hooks can be compared by their parameters.
// Unknown plugin hooks may close over state, so keep those materials distinct.
export function surfaceProgramIdentity (material) {
  const program = programs.get(material)
  if (program && material.onBeforeCompile === program.compile && material.customProgramCacheKey === program.cacheKey) return program.key
  if (material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey) return 'native'
  return null
}

function rememberProgram (material, previous, extension) {
  programs.set(material, { compile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey, key: previous == null ? null : previous + ':' + extension })
}

// The document material editor predates the shared surface schema and still
// stores these legacy names. Keep the conversion at the shader boundary so
// imported materials, render nodes and shared-display packets use one set of
// surface parameters.
const materialTypeAliases = {
  general: 'generic',
  paint: 'coated',
  textured: 'generic'
}

export function normalizeSurfaceMaterialType (value) {
  const type = String(value || 'generic').toLowerCase()
  return materialTypeAliases[type] || type
}
// r120 transmission is an alpha stub. Replace it with a bounded screen-space
// refraction pass; retain native PBR reflection, lights, bump and normal mapping.
export function applyMaterialSurface (material) {
  const settings = material.userData.pandaSurface
  if (!settings || !material.isMeshPhysicalMaterial) return null
  let uniforms = states.get(material)
  if (!uniforms) {
    uniforms = { pandaScene: { value: null },
      pandaSceneBlur1: { value: null },
      pandaSceneBlur2: { value: null },
      pandaSceneBlur3: { value: null },
      pandaSceneBlur4: { value: null },
      pandaSceneDepth: { value: null },
      pandaSceneDepthReady: { value: 0 },
      pandaSceneSize: { value: new THREE.Vector2(1, 1) },
      pandaCameraRange: { value: new THREE.Vector3(0.1, 1000, 1) },
      pandaSceneReady: { value: 0 },
      pandaProjection: { value: new THREE.Matrix4() },
      pandaIOR: { value: 1.5 },
      pandaReflection: { value: 1 },
      pandaThickness: { value: 1 },
      pandaBlur: { value: 0 },
      pandaFrostDistance: { value: 1000 },
      pandaFog: { value: new THREE.Color(1, 1, 1) },
      pandaFogDistance: { value: 10 } }
    const program = surfaceProgramIdentity(material)
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = `uniform sampler2D pandaScene, pandaSceneBlur1, pandaSceneBlur2, pandaSceneBlur3, pandaSceneBlur4, pandaSceneDepth;
uniform float pandaSceneReady, pandaSceneDepthReady, pandaIOR, pandaReflection, pandaThickness, pandaBlur, pandaFogDistance, pandaFrostDistance;
uniform vec3 pandaFog, pandaCameraRange;
uniform vec2 pandaSceneSize;
uniform mat4 pandaProjection;
float pandaTransmissionDepth(vec2 uv) {
  // Match Three's RGBA depth packing: alpha contains the most significant byte.
  float z = clamp(dot(texture2D(pandaSceneDepth, uv), (255.0 / 256.0) / vec4(16777216.0,65536.0,256.0,1.0)), 0.0, 1.0);
  float near_ = pandaCameraRange.x, far_ = pandaCameraRange.y;
  return pandaCameraRange.z > 0.5 ? near_ * far_ / max(far_ - z * (far_ - near_), 0.000001) : mix(near_, far_, z);
}
vec3 pandaTransmissionSample(vec2 uv, float radius) {
  // Interpolate variance between Gaussian scales. Radius is in screen pixels,
  // derived from the glass-to-background gap, not the glass-camera distance.
  float variance = radius * radius;
  if (radius < 0.01) return texture2D(pandaScene, uv).rgb;
  if (radius < 3.3) return mix(texture2D(pandaScene, uv).rgb, texture2D(pandaSceneBlur1, uv).rgb, variance / 10.89);
  if (radius < 13.6) return mix(texture2D(pandaSceneBlur1, uv).rgb, texture2D(pandaSceneBlur2, uv).rgb, (variance - 10.89) / (184.96 - 10.89));
  if (radius < 54.0) return mix(texture2D(pandaSceneBlur2, uv).rgb, texture2D(pandaSceneBlur3, uv).rgb, (variance - 184.96) / (2916.0 - 184.96));
  return mix(texture2D(pandaSceneBlur3, uv).rgb, texture2D(pandaSceneBlur4, uv).rgb, clamp((variance - 2916.0) / (46656.0 - 2916.0), 0.0, 1.0));
}
float pandaFrostDiffusion(float rough, float gap) {
  if (rough <= 0.0) return 0.0;
  if (rough >= 1.0) return 1.0;
  float odds = rough / max(1.0 - rough, 0.000001);
  float dose = min(max(gap, 0.0) / max(pandaFrostDistance, 0.0001) * odds * odds, 10.0);
  // At roughness .5 and gap == reference distance, only 1% of
  // directional detail remains. Low roughness has a gentle fourth-power onset.
  return 1.0 - exp(-4.605170186 * dose * dose);
}
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
          float transmissionBlur = max(pandaBlur, roughnessFactor);
          if (pandaSceneReady > 0.5) {
            vec4 projected = pandaProjection * vec4(-vViewPosition + ray * pandaThickness, 1.0);
            vec2 uv = clamp(projected.xy / max(projected.w, 0.00001) * 0.5 + 0.5, 0.002, 0.998);
            float radius = pow(clamp(transmissionBlur, 0.0, 1.0), 1.5) * 20.0;
            float diffusion = transmissionBlur >= 1.0 ? 1.0 : 0.0;
            if (pandaSceneDepthReady > 0.5) {
              float behind = pandaTransmissionDepth(uv);
              float gap = max(behind - vViewPosition.z, 0.0) / max(abs(ray.z), 0.15);
              float spread = tan(0.5 * transmissionBlur * transmissionBlur) * gap;
              float projectionDivisor = pandaCameraRange.z > 0.5 ? max(behind, 0.0001) : 1.0;
              radius = 0.5 * pandaSceneSize.y * abs(pandaProjection[1][1]) * spread / projectionDivisor;
              diffusion = pandaFrostDiffusion(transmissionBlur, gap);
            }
            transmitted = pandaTransmissionSample(uv, radius);
            transmitted = mix(transmitted, texture2D(pandaSceneBlur4, uv).rgb, diffusion);
          } else {
            #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
              transmitted = textureCubeUV(envMap, inverseTransformDirection(ray, viewMatrix), transmissionBlur).rgb * envMapIntensity;
            #endif
          }
          float f0 = pow((pandaIOR - 1.0) / (pandaIOR + 1.0), 2.0);
          float fresnel = (f0 + (1.0 - f0) * pow(1.0 - saturate(dot(-incident, normal)), 5.0)) * pandaReflection;
          transmitted *= pow(max(pandaFog, vec3(0.0001)), vec3(pandaThickness / max(pandaFogDistance, 0.0001)));
          vec3 diffuseLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          outgoingLight = mix(diffuseLight, transmitted * (1.0 - fresnel), totalTransmission) + specular * pandaReflection + totalEmissiveRadiance;
        }
      `)
      // The transmission pass already contains the captured scene behind the
      // surface. Keeping the source alpha here would make WebGL blend that
      // captured scene with the same scene a second time. This is especially
      // visible when an imported glass material has both transmission and an
      // opacity below one. The original material keeps its normal alpha until
      // the refraction pass binds a captured background (pandaSceneReady=1).
      const output = /gl_FragColor\s*=\s*vec4\s*\(\s*outgoingLight\s*,\s*diffuseColor\.a\s*\)\s*;/
      if (!output.test(shader.fragmentShader)) throw new Error('Unsupported physical shader: output block missing.')
      shader.fragmentShader = shader.fragmentShader.replace(output, 'gl_FragColor = vec4( outgoingLight, (pandaSceneReady > 0.5 && totalTransmission > 0.0) ? 1.0 : diffuseColor.a );')
    }
    material.customProgramCacheKey = () => cacheKey + ':panda-surface-v5'
    rememberProgram(material, program, 'surface-v5')
    states.set(material, uniforms)
    material.needsUpdate = true
  }
  uniforms.pandaIOR.value = settings.ior ?? 1.5
  uniforms.pandaReflection.value = settings.reflection ?? 1
  uniforms.pandaThickness.value = settings.thickness ?? 1
  uniforms.pandaBlur.value = settings.refractionRoughness ?? 0
  uniforms.pandaFrostDistance.value = settings.frostDistance ?? 1000
  uniforms.pandaFog.value.set(settings.refractionColor || '#ffffff').convertSRGBToLinear()
  uniforms.pandaFogDistance.value = settings.attenuationDistance ?? 10
  return uniforms
}

// Reflective document materials need a scene capture in addition to the
// environment map. Keep this shader extension separate from the transmission
// extension above so unbound glass programs retain their existing behavior.
export function applySceneReflection (material) {
  if (!material?.isMeshPhysicalMaterial) return null
  let uniforms = reflectionStates.get(material)
  if (!uniforms) {
    uniforms = {
      pandaReflectionScene: { value: null },
      pandaReflectionDepth: { value: null },
      pandaReflectionReady: { value: 0 },
      pandaReflectionDepthReady: { value: 0 },
      pandaReflectionProjection: { value: new THREE.Matrix4() },
      pandaReflectionDistance: { value: 25 },
      pandaReflectionNear: { value: 0.1 },
      pandaReflectionFar: { value: 1000 },
      pandaReflectionPerspective: { value: 1 },
      pandaReflectionPlanar: { value: 0 },
      pandaReflectionMirrorProjection: { value: new THREE.Matrix4() },
      pandaReflectionAmount: { value: 1 }
    }
    const program = surfaceProgramIdentity(material)
    const compile = material.onBeforeCompile
    const cacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = 'varying vec3 pandaReflectionWorldPosition;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 pandaReflectionWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          pandaReflectionWorld = instanceMatrix * pandaReflectionWorld;
        #endif
        pandaReflectionWorldPosition = (modelMatrix * pandaReflectionWorld).xyz;`)
      shader.fragmentShader = `uniform sampler2D pandaReflectionScene, pandaReflectionDepth;
uniform float pandaReflectionReady, pandaReflectionDepthReady, pandaReflectionDistance, pandaReflectionNear, pandaReflectionFar, pandaReflectionPerspective, pandaReflectionPlanar, pandaReflectionAmount;
uniform mat4 pandaReflectionProjection, pandaReflectionMirrorProjection;
varying vec3 pandaReflectionWorldPosition;
vec3 pandaReflectionBlurSample(vec2 uv, float spread) {
  vec3 result = texture2D(pandaReflectionScene, uv).rgb;
  if (spread > 0.001) {
    vec2 offset = vec2(spread, 0.0);
    result += texture2D(pandaReflectionScene, uv + offset).rgb;
    result += texture2D(pandaReflectionScene, uv - offset).rgb;
    offset = vec2(0.0, spread);
    result += texture2D(pandaReflectionScene, uv + offset).rgb;
    result += texture2D(pandaReflectionScene, uv - offset).rgb;
    result *= 0.2;
  }
  return result;
}
float pandaReflectionUnpackDepth(vec4 depthRGBA) {
  return clamp(dot(depthRGBA, (255.0 / 256.0) / vec4(16777216.0,65536.0,256.0,1.0)), 0.0, 1.0);
}
float pandaReflectionDepthDistance(float depth) {
  return pandaReflectionPerspective > 0.5
    ? pandaReflectionNear * pandaReflectionFar / max(pandaReflectionFar - depth * (pandaReflectionFar - pandaReflectionNear), 0.000001)
    : mix(pandaReflectionNear, pandaReflectionFar, depth);
}
` + shader.fragmentShader
      const output = shader.fragmentShader.match(/gl_FragColor\s*=\s*vec4\s*\(\s*outgoingLight\s*,[^;]*\)\s*;/)?.[0]
      if (!output) throw new Error('Unsupported physical shader: output block missing.')
      shader.fragmentShader = shader.fragmentShader.replace(output, `
        if (pandaReflectionReady > 0.5 && pandaReflectionAmount > 0.0) {
          // Three.js exposes vViewPosition as the surface-to-camera vector;
          // the actual view-space surface position is its negation.
          vec3 pandaReflectionView = normalize(vViewPosition);
          vec3 pandaReflectionRay = normalize(reflect(-pandaReflectionView, normal));
          vec3 pandaReflectionColor = vec3(0.0);
          float pandaReflectionHit = 0.0;
          vec2 pandaReflectionUv = vec2(-1.0);
          if (pandaReflectionPlanar > 0.5) {
            vec4 pandaReflectionPoint = pandaReflectionMirrorProjection * vec4(pandaReflectionWorldPosition, 1.0);
            pandaReflectionUv = pandaReflectionPoint.xy / max(pandaReflectionPoint.w, 0.00001) * 0.5 + 0.5;
            if (pandaReflectionPoint.w > 0.0 && all(greaterThan(pandaReflectionUv, vec2(0.002))) && all(lessThan(pandaReflectionUv, vec2(0.998)))) pandaReflectionHit = 1.0;
          } else if (pandaReflectionDepthReady > 0.5) {
            // A ray must cross a visible depth surface and finish within a thin
            // tolerance. Treating ANY point behind it as a hit reveals objects
            // through open opaque shells. With no depth, retain native lighting.
            vec3 origin = -vViewPosition + normal * max(0.0001, vViewPosition.z * 0.00001);
            float range_ = min(pandaReflectionDistance, max(1.0, vViewPosition.z * 2.0));
            float previousDelta = 0.0, previousTravel = 0.0;
            bool previousValid = false;
            for (int pandaReflectionStep = 0; pandaReflectionStep <= 32; pandaReflectionStep++) {
              float fraction = float(pandaReflectionStep) / 32.0;
              float pandaReflectionTravel = range_ * fraction * fraction;
              vec3 rayPoint = origin + pandaReflectionRay * pandaReflectionTravel;
              vec4 pandaReflectionPoint = pandaReflectionProjection * vec4(rayPoint, 1.0);
              vec2 sampleUv = pandaReflectionPoint.xy / max(pandaReflectionPoint.w, 0.00001) * 0.5 + 0.5;
              if (pandaReflectionPoint.w <= 0.0 || rayPoint.z >= -pandaReflectionNear || any(lessThanEqual(sampleUv, vec2(0.002))) || any(greaterThanEqual(sampleUv, vec2(0.998)))) break;
              float depth = pandaReflectionUnpackDepth(texture2D(pandaReflectionDepth, sampleUv));
              float delta = -rayPoint.z - pandaReflectionDepthDistance(depth);
              if (previousValid && previousDelta < 0.0 && delta >= 0.0 && depth < 1.0) {
                float lo = previousTravel, hi = pandaReflectionTravel;
                for (int refine = 0; refine < 6; refine++) {
                  float mid = (lo + hi) * 0.5;
                  vec3 point_ = origin + pandaReflectionRay * mid;
                  vec4 projected_ = pandaReflectionProjection * vec4(point_, 1.0);
                  vec2 uv_ = projected_.xy / projected_.w * 0.5 + 0.5;
                  float z_ = pandaReflectionDepthDistance(pandaReflectionUnpackDepth(texture2D(pandaReflectionDepth, uv_)));
                  if (-point_.z >= z_) hi = mid; else lo = mid;
                }
                vec3 hitPoint = origin + pandaReflectionRay * hi;
                vec4 hitProjection = pandaReflectionProjection * vec4(hitPoint, 1.0);
                vec2 hitUv = hitProjection.xy / hitProjection.w * 0.5 + 0.5;
                float hitDepth = pandaReflectionUnpackDepth(texture2D(pandaReflectionDepth, hitUv));
                float sceneDistance = pandaReflectionDepthDistance(hitDepth);
                if (hitDepth < 1.0 && abs(-hitPoint.z - sceneDistance) <= max(0.005, sceneDistance * 0.002)) {
                  pandaReflectionUv = hitUv; pandaReflectionHit = 1.0; break;
                }
              }
              previousDelta = delta; previousTravel = pandaReflectionTravel; previousValid = depth < 1.0;
            }
          }
          if (pandaReflectionHit > 0.0) {
            float edgeDistance = min(min(pandaReflectionUv.x, pandaReflectionUv.y), min(1.0 - pandaReflectionUv.x, 1.0 - pandaReflectionUv.y));
            pandaReflectionHit *= smoothstep(0.002, 0.03, edgeDistance);
            float pandaReflectionSpread = roughness * roughness * 0.012;
            pandaReflectionColor = pandaReflectionBlurSample(pandaReflectionUv, pandaReflectionSpread);
          }
          float pandaReflectionViewAngle = clamp(abs(dot(pandaReflectionView, normal)), 0.0, 1.0);
          float pandaReflectionFresnel = 0.04 + 0.96 * pow(1.0 - pandaReflectionViewAngle, 5.0);
          float pandaReflectionBase = mix(0.04 * reflectivity, 1.0, metalness);
          float pandaReflectionWeight = clamp(pandaReflectionAmount * pandaReflectionHit * max(pandaReflectionBase, pandaReflectionFresnel) * (1.0 - 0.8 * roughness), 0.0, 1.0);
          outgoingLight = mix(outgoingLight, pandaReflectionColor, pandaReflectionWeight);
        }
        ${output}`)
    }
    material.customProgramCacheKey = () => cacheKey + ':panda-scene-reflection-v2'
    rememberProgram(material, program, 'reflection-v2')
    reflectionStates.set(material, uniforms)
    material.needsUpdate = true
  }
  const settings = material.userData?.pandaSurface || {}
  uniforms.pandaReflectionAmount.value = settings.reflection ?? 1
  return uniforms
}

export function setSurfaceSettings (material, patch) {
  patch = { ...(patch || {}) }
  if (patch.materialType != null) patch.materialType = normalizeSurfaceMaterialType(patch.materialType)
  if (patch.reflection == null && patch.reflectivity != null) patch.reflection = patch.reflectivity
  if (patch.opacity == null && patch.renderOpacity != null) patch.opacity = patch.renderOpacity
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
    materialType: normalizeSurfaceMaterialType(saved.materialType || inferred),
    reflection: saved.reflection ?? reflection,
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
