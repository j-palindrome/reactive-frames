export const rotate2d = /*glsl*/ `
vec2 rotate2d(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, s, -s, c);
	return m * v;
}`

export const cubicBezier = /*glsl*/ `
vec2 cubicBezier(float t, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
  return pow(1.0 - t, 3.0) * p0
    + 3.0 * pow(1.0 - t, 2.0) * t * p1
    + 3.0 * (1.0 - t) * pow(t, 2.0) * p2
    + pow(t, 3.0) * p3;
}`

export const cubicBezierNormal = /*glsl*/ `
${rotate2d}
vec2 cubicBezierNormal(float t, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
  vec2 normal = pow(1.0 - t, 2.0) * (p1 - p0) + 2.0 * t * (1.0 - t) * (p2 - p1) + pow(t, 2.0) * (p3 - p2);
  return normalize(rotate2d(normal, 3.141592653589793 * 0.5));
}`

export const positionToUv = /*glsl*/ `
vec2 positionToUv(vec2 pos) {
  return vec2(pos.x + 1.0, pos.y + 1.0) / 2.0;
}`

export const defaultVert2DNoResolution = /*glsl*/ `
in vec2 position;
out vec2 uv;
${positionToUv}
void main() {
  uv = positionToUv(position);
  gl_Position = vec4(position.x, position.y, 0, 1);
}`

export const toES300 = (shader: string) => {
  return shader
    .replace(/^ *precision.*/gm, '')
    .replace(/varying/g, 'in')
    .replace(/gl_FragColor/g, 'fragColor')
    .replace(/texture2D/g, 'texture')
}
