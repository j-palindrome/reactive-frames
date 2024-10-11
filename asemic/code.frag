in vec2 point;
in vec2 vertex;
in float rotation;

out vec2 uv;
out float instance;

uniform sampler2D controlPoints;
uniform float size;
uniform vec2 resolution;
uniform float jitterBias;
uniform float rotationJitter;
uniform float positionJitter;
uniform float sizeJitter;

{
  hash } {
  rotate2d } {
  PI } void main() {
  instance = float(gl_InstanceID);
  float pointSize = size / resolution.x;
  float jitterHash = hash(point.x);
  float jitterSign = hash(point.x + 3.1432);
  float rotation = 0.;
  if(jitterSign > 0.5)
    jitterSign = 1.0;
  else
    jitterSign = -1.0;

  gl_Position = vec4(
            // rotate2d(
            //   position.xy * (pointSize + (hash(point.x + 0.8241) - 0.5) * sizeJitter * pointSize)
            //     + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize),
            //   -rotation + (hash(point.x + 1.2341) - 0.5) * rotationJitter * PI)
            // + point,
  point + (vertex / (resolution / resolution.x) - 0.5) * pointSize, 0, 1);
  uv = vertex;
}