import { range } from 'lodash'
import { generateShape, Layer } from './mesh'
import * as twgl from 'twgl.js'
type Point = [number, number]

class Asemic {
  ctx: WebGL2RenderingContext
  layers: Layer[]

  constructor(ctx: Asemic['ctx'], brushes: Brush[]) {
    this.ctx = ctx
  }
}

class Brush {
  layer: Layer

  constructor(
    gl: WebGL2RenderingContext,
    points: Point[],
    {
      brushSource,
      rotationJitter,
      sizeJitter,
      positionJitter,
      jitterBias
    }: {
      brushSource: WebGLTexture
      rotationJitter: number
      sizeJitter: number
      positionJitter: number
      jitterBias: number
    }
  ) {
    this.layer = new Layer({
      gl,
      drawMode: 'triangles',
      vertexShader: /*glsl*/ `
      in vec2 points;
      in float rotation;
      in vec3 position;
      in vec2 heading;
      in vec2 vertex;
      in vec2 texcoord;
      out vec2 uv;
      out float instance;
      uniform float size;
      uniform vec2 resolution;
      uniform float jitterBias;
      uniform float rotationJitter;
      uniform float positionJitter;
      uniform float sizeJitter;

      ${hash}
      ${rotate2d}
      ${PI}

      void main() {
        instance = float(gl_InstanceID);
        float pointSize = size / resolution.x;
        float jitterHash = hash(points.x);
        float jitterSign = hash(points.x + 3.1432);
        if (jitterSign > 0.5) jitterSign = 1.0;
        else jitterSign = -1.0;

        gl_Position = vec4(
          rotate2d(position.xy * (pointSize + (hash(points.x + 0.8241) - 0.5) * sizeJitter * pointSize)
          + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize), 
            -rotation + (hash(points.x + 1.2341) - 0.5) * rotationJitter * PI) 
          + points, 0, 1);
        uv = texcoord;
      }`,
      fragmentShader: /*glsl*/ `
      in vec2 uv;
      in float instance;
      
      void main() {
        fragColor = vec4(1, 1, 1, 1);
      }`,
      attributes: {
        points: {
          numComponents: 2,
          data: range(count).flatMap(x =>
            arc(radFunc(x / count / 2 + 0.75), [0, -1], [0.8, 1.8])
          ),

          divisor: 1
          // data: [0, 0]
        },
        rotation: {
          numComponents: 1,
          data: range(count).flatMap(x =>
            toAngle(arcTangent(radFunc(x / count / 2 + 0.75), [0.8, 1.8]))
          ),
          divisor: 1
        },
        vertex: {
          numComponents: 2,
          data: generateShape('squareCenter')
        },
        ...twgl.primitives.createXYQuadVertices(1)
      }
    })
  }
}
