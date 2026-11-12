export const COMPUTE_SHADER = /* wgsl */ `
struct Params {
  size: vec4u,
  camera: vec4f,
  forward: vec4f,
  right: vec4f,
  up: vec4f,
  clip: vec4f,
  ortho: vec4f,
  skyTop: vec4f,
  skyBottom: vec4f,
  skyUp: vec4f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> scene: array<u32>;
@group(0) @binding(2) var<storage, read_write> accumulation: array<vec4f>;
@group(0) @binding(3) var outputImage: texture_storage_2d<rgba8unorm, write>;
const PI: f32 = 3.141592653589793;
const MISS: u32 = 0xffffffffu;
var<private> randomState: u32;
fn random() -> f32 {
  randomState = randomState * 747796405u + 2891336453u;
  let word = ((randomState >> ((randomState >> 28u) + 4u)) ^ randomState) * 277803737u;
  return f32((word >> 22u) ^ word) * (1.0 / 4294967296.0);
}
fn f(index: u32) -> f32 { return bitcast<f32>(scene[index]); }
fn v(index: u32) -> vec3f { return vec3f(f(index), f(index+1u), f(index+2u)); }
fn inverseMatrix(index: u32) -> mat4x4f {
  return mat4x4f(vec4f(v(index), f(index+3u)), vec4f(v(index+4u), f(index+7u)), vec4f(v(index+8u), f(index+11u)), vec4f(v(index+12u), f(index+15u)));
}
fn safeNormal(value: vec3f, fallback: vec3f) -> vec3f {
  let lengthSquared = dot(value,value);
  if (lengthSquared > 0.0) { return value * inverseSqrt(lengthSquared); }
  return fallback;
}
fn boxHit(node: u32, origin: vec3f, direction: vec3f, nearT: f32, farT: f32) -> bool {
  let offset = scene[0] + node * 12u;
  let lo = v(offset); let hi = v(offset+4u);
  var low = nearT; var high = farT;
  for (var axis = 0u; axis < 3u; axis++) {
    if (direction[axis] == 0.0) {
      if (origin[axis] < lo[axis] || origin[axis] > hi[axis]) { return false; }
    } else {
      let a = (lo[axis]-origin[axis]) / direction[axis];
      let b = (hi[axis]-origin[axis]) / direction[axis];
      low = max(low,min(a,b)); high = min(high,max(a,b));
      if (high < low) { return false; }
    }
  }
  return true;
}
struct Hit { t: f32, normal: vec3f, geometric: vec3f, instance: u32 }
fn trace(origin: vec3f, direction: vec3f, nearT: f32, farT: f32) -> Hit {
  var best = farT; var bestTriangle = MISS; var bestInstance = MISS; var bary = vec2f(0.0);
  var top = scene[8];
  for (var topStep = 0u; topStep < scene[1] && top < scene[9]; topStep++) {
    let node = scene[0] + top * 12u;
    if (!boxHit(top, origin, direction, nearT, best)) { top = scene[node+8u]; continue; }
    if (scene[node+7u] == 0u) { top++; continue; }
    // TLAS leaves have exactly one instance, guaranteed by buildScene.
    let instance = scene[node+3u]; let instanceOffset = scene[4] + instance * 32u;
    let inv = inverseMatrix(instanceOffset);
    let localOrigin = (inv * vec4f(origin,1.0)).xyz;
    // Do NOT normalize: t remains a distance along the original world ray.
    let localDirection = (inv * vec4f(direction,0.0)).xyz;
    var bottom = scene[instanceOffset+24u]; let bottomEnd = scene[instanceOffset+25u];
    for (var bottomStep = 0u; bottomStep < scene[1] && bottom < bottomEnd; bottomStep++) {
      let bn = scene[0] + bottom * 12u;
      if (!boxHit(bottom,localOrigin,localDirection,nearT,best)) { bottom = scene[bn+8u]; continue; }
      let count = scene[bn+7u];
      if (count == 0u) { bottom++; continue; }
      let first = scene[bn+3u];
      for (var j = 0u; j < count; j++) {
        let triangle = first+j; let offset = scene[2] + triangle * 24u;
        let a = v(offset); let e1 = v(offset+4u)-a; let e2 = v(offset+8u)-a;
        let p = cross(localDirection,e2); let determinant = dot(e1,p);
        if (determinant == 0.0) { continue; }
        let s = localOrigin-a; let u = dot(s,p)/determinant;
        if (u < 0.0 || u > 1.0) { continue; }
        let q = cross(s,e1); let vv = dot(localDirection,q)/determinant;
        if (vv < 0.0 || u+vv > 1.0) { continue; }
        let t = dot(e2,q)/determinant;
        if (t >= nearT && t < best) { best = t; bestTriangle = triangle; bestInstance = instance; bary = vec2f(u,vv); }
      }
      bottom = scene[bn+8u];
    }
    top = scene[node+8u];
  }
  if (bestInstance == MISS) { return Hit(farT,vec3f(0.0),vec3f(0.0),MISS); }
  let offset = scene[2] + bestTriangle * 24u;
  let inv = inverseMatrix(scene[4] + bestInstance * 32u);
  let normalMatrix = transpose(mat3x3f(inv[0].xyz,inv[1].xyz,inv[2].xyz));
  var geometric = safeNormal(normalMatrix * cross(v(offset+4u)-v(offset),v(offset+8u)-v(offset)),vec3f(0.0,1.0,0.0));
  var normal = safeNormal(normalMatrix * (v(offset+12u)*(1.0-bary.x-bary.y)+v(offset+16u)*bary.x+v(offset+20u)*bary.y),geometric);
  if (dot(geometric,direction) > 0.0) { geometric = -geometric; }
  if (dot(normal,geometric) < 0.0) { normal = -normal; }
  if (dot(normal,direction) >= 0.0) { normal = geometric; }
  return Hit(best,normal,geometric,bestInstance);
}
fn distribution(noH: f32, alpha2: f32) -> f32 {
  let denominator = noH*noH*(alpha2-1.0)+1.0;
  return alpha2 / max(PI*denominator*denominator,1e-20);
}
fn smith(noV: f32, alpha2: f32) -> f32 {
  return 2.0*noV / max(noV+sqrt(alpha2+(1.0-alpha2)*noV*noV),1e-10);
}
fn brdf(n: vec3f, view: vec3f, light: vec3f, base: vec3f, metallic: f32, roughness: f32) -> vec3f {
  let noL = max(dot(n,light),0.0); let noV = max(dot(n,view),0.0);
  if (noL <= 0.0 || noV <= 0.0) { return vec3f(0.0); }
  let h = safeNormal(view+light,n); let noH = max(dot(n,h),0.0); let voH = max(dot(view,h),0.0);
  let alpha = max(roughness*roughness,0.001); let a2 = alpha*alpha;
  let f0 = mix(vec3f(0.04),base,metallic);
  let fresnel = f0+(vec3f(1.0)-f0)*pow(1.0-voH,5.0);
  let specular = distribution(noH,a2)*smith(noV,a2)*smith(noL,a2)*fresnel / max(4.0*noV*noL,1e-10);
  return (vec3f(1.0)-fresnel)*(1.0-metallic)*base/PI+specular;
}
fn basis(n: vec3f, local: vec3f) -> vec3f {
  var axis = vec3f(0.0,0.0,1.0);
  if (abs(n.z) > 0.99) { axis = vec3f(0.0,1.0,0.0); }
  let tangent = normalize(cross(axis,n)); let bitangent = cross(n,tangent);
  return safeNormal(tangent*local.x+bitangent*local.y+n*local.z,n);
}
fn sky(direction: vec3f) -> vec3f { return mix(params.skyBottom.xyz,params.skyTop.xyz,clamp(dot(direction,params.skyUp.xyz)*0.5+0.5,0.0,1.0))*params.skyTop.w; }
fn radiance(originInput: vec3f, directionInput: vec3f) -> vec3f {
  var origin = originInput; var direction = directionInput;
  var result = vec3f(0.0); var throughput = vec3f(1.0);
  for (var bounce = 0u; bounce < min(params.size.w,32u); bounce++) {
    var nearT = params.clip.z; var farT = 1e30;
    if (bounce == 0u) {
      let forwardCosine = max(dot(direction,params.forward.xyz),1e-8);
      nearT = params.clip.x/forwardCosine; farT = params.clip.y/forwardCosine;
    }
    let hit = trace(origin,direction,nearT,farT);
    if (hit.instance == MISS) { result += throughput*sky(direction); break; }
    let at = scene[4] + hit.instance*32u; let base = v(at+16u); let metallic = f(at+19u); let roughness = f(at+23u);
    result += throughput*v(at+20u);
    let position = origin+direction*hit.t; let n = hit.normal; let view = -direction;
    let rayOrigin = position+hit.geometric*params.clip.z;
    for (var lightIndex = 0u; lightIndex < scene[7]; lightIndex++) {
      let lightOffset = scene[6]+lightIndex*8u;
      var lightDirection = -v(lightOffset); var lightColor = v(lightOffset+4u); var maxDistance = 1e30;
      if (scene[lightOffset+3u] == 1u) {
        let delta = v(lightOffset)-position; let distance2 = dot(delta,delta);
        if (distance2 <= params.clip.z*params.clip.z) { continue; }
        // Evaluate at surface, but aim visibility from the offset ray origin.
        lightDirection = delta*inverseSqrt(distance2); lightColor /= distance2;
        maxDistance = length(v(lightOffset)-rayOrigin)-params.clip.z;
      }
      let noL = max(dot(n,lightDirection),0.0);
      if (noL > 0.0 && dot(hit.geometric,lightDirection) > 0.0) {
        var shadowDirection = lightDirection;
        if (scene[lightOffset+3u] == 1u) { shadowDirection = normalize(v(lightOffset)-rayOrigin); }
        let blocker = trace(rayOrigin,shadowDirection,0.0,maxDistance);
        if (blocker.instance == MISS) { result += throughput*brdf(n,view,lightDirection,base,metallic,roughness)*lightColor*noL; }
      }
    }
    if (bounce+1u == params.size.w) { break; }
    let specProbability = 0.25+0.75*metallic;
    let choose = random(); let u = min(random(),0.99999994); let phi = 2.0*PI*random();
    let alpha = max(roughness*roughness,0.001); let a2 = alpha*alpha;
    var nextDirection: vec3f;
    if (choose < specProbability) {
      let cosTheta = sqrt((1.0-u)/(1.0+(a2-1.0)*u)); let sinTheta = sqrt(max(0.0,1.0-cosTheta*cosTheta));
      let halfVector = basis(n,vec3f(cos(phi)*sinTheta,sin(phi)*sinTheta,cosTheta));
      nextDirection = reflect(direction,halfVector);
    } else {
      nextDirection = basis(n,vec3f(sqrt(u)*cos(phi),sqrt(u)*sin(phi),sqrt(1.0-u)));
    }
    let noL = dot(n,nextDirection);
    if (noL <= 0.0 || dot(hit.geometric,nextDirection) <= 0.0) { break; }
    let halfVector = safeNormal(view+nextDirection,n);
    let noH = max(dot(n,halfVector),0.0); let voH = max(dot(view,halfVector),1e-10);
    let pdf = (1.0-specProbability)*noL/PI+specProbability*distribution(noH,a2)*noH/(4.0*voH);
    if (pdf <= 0.0) { break; }
    throughput *= brdf(n,view,nextDirection,base,metallic,roughness)*noL/pdf;
    if (bounce >= 2u) {
      let survival = clamp(max(throughput.x,max(throughput.y,throughput.z)),0.05,0.95);
      if (random() > survival) { break; }
      throughput /= survival;
    }
    origin = rayOrigin; direction = nextDirection;
  }
  return result;
}
fn srgb(value: vec3f) -> vec3f {
  return select(1.055*pow(value,vec3f(1.0/2.4))-0.055,12.92*value,value <= vec3f(0.0031308));
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  let pixel = id.y*params.size.x+id.x;
  randomState = pixel*1973u+params.size.z*9277u+bitcast<u32>(params.clip.w)*26699u+911u;
  let uv = (vec2f(id.xy)+vec2f(random(),random()))/vec2f(params.size.xy);
  var origin = params.camera.xyz; var direction: vec3f;
  if (params.camera.w == 1.0) {
    origin += params.right.xyz*mix(params.ortho.x,params.ortho.y,uv.x)+params.up.xyz*mix(params.ortho.w,params.ortho.z,uv.y);
    direction = params.forward.xyz;
  } else {
    direction = normalize(params.forward.xyz+params.right.xyz*((uv.x*2.0-1.0)*params.forward.w*params.right.w)+params.up.xyz*((1.0-uv.y*2.0)*params.forward.w));
  }
  let sampleColor = radiance(origin,direction);
  var mean = sampleColor;
  if (params.size.z > 0u) { let previous = accumulation[pixel].xyz; mean = previous+(sampleColor-previous)/f32(params.size.z+1u); }
  accumulation[pixel] = vec4f(mean,1.0);
  let exposed = max(mean*params.up.w,vec3f(0.0));
  textureStore(outputImage,vec2i(id.xy),vec4f(srgb(exposed/(vec3f(1.0)+exposed)),1.0));
}
`

export const PRESENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var image: texture_2d<f32>;
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u); let y = f32(index & 2u);
  return vec4f(x*2.0-1.0,y*2.0-1.0,0.0,1.0);
}
@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(image,vec2i(position.xy),0);
}
`
