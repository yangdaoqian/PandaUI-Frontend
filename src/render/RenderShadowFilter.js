import * as THREE from 'three'

// r120's PCF samples nearest depth texels: increasing radius spreads the steps
// instead of interpolating them. Compare first, then bilinearly interpolate
// each tap. Never interpolate packed RGBA depths before the depth comparison.
const bilinear = `
float pandaShadowTap(sampler2D map, vec2 uv, vec2 size, float depth) {
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  vec2 base = (floor(p) + 0.5) / size;
  vec2 texel = 1.0 / size;
  return mix(
    mix(texture2DCompare(map, base, depth), texture2DCompare(map, base + vec2(texel.x, 0.0), depth), f.x),
    mix(texture2DCompare(map, base + vec2(0.0, texel.y), depth), texture2DCompare(map, base + texel, depth), f.x), f.y);
}
`
const pcf = `
  float total = 0.0; float weights = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y)) * shadowRadius / shadowMapSize;
      float weight = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      total += weight * pandaShadowTap(shadowMap, shadowCoord.xy + offset, shadowMapSize, shadowCoord.z);
      weights += weight;
    }
  }
  shadow = total / weights;
`
const chunk = THREE.ShaderChunk.shadowmap_pars_fragment
  .replace('float getShadow(', bilinear + '\nfloat getShadow(')
  .replace(/(#if defined\( SHADOWMAP_TYPE_PCF \))[\s\S]*?(#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \))/, '$1\n' + pcf + '\n$2')

export function applyRenderShadowFilter (material) {
  const compile = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', chunk)
  }
  material.customProgramCacheKey = () => key + ':pandaui-bilinear-pcf-v2'
  return material
}
