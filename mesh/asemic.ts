import { clamp, range } from 'lodash'
import * as twgl from 'twgl.js'
import { arc } from '../examples/util/src/geometry'
import { rotate2d } from './../examples/util/src/shaders/manipulation'
import { hash, PI } from './../examples/util/src/shaders/utilities'
import { generateShape, Layer } from './mesh'
import { arcTangent, toAngle } from '../examples/util/src/geometry'
import { rad as radFunc } from '../examples/util/src/math'
import * as THREE from 'three'
import {
  catmullRomCurve,
  catmullRomSpline
} from '../examples/util/src/shaders/curve'
import { Model } from '@luma.gl/engine'
import { Device, luma, RenderPass, Texture } from '@luma.gl/core'
import invariant from 'tiny-invariant'
import { WebGLDevice } from '@luma.gl/webgl'

luma.registerDevices([WebGLDevice])

type Point = [number, number]

export default class Asemic {
  device?: Device
  renderPass?: RenderPass

  async init(gl: WebGL2RenderingContext, onInit?: (device: Device) => void) {
    const device = await luma.attachDevice({ handle: gl })
    this.device = device

    onInit?.(device)
  }

  constructor(gl: WebGL2RenderingContext, onInit?: (device: Device) => void) {
    this.init(gl, onInit)
  }

  beginDraw() {
    invariant(this.device)
    this.renderPass = this.device.beginRenderPass()
    return this.renderPass
  }

  endDraw() {
    this.renderPass!.end()
  }
}

export class Brush {
  uniforms: Record<string, any>
  texture: Texture
  device: WebGLDevice
  model: Model

  constructor(
    device: Device,
    uniforms: {
      rotationJitter?: number
      positionJitter?: number
      jitterBias?: number
      sizeJitter?: number
      count: number
      resolution: [number, number]
      size: number
    } = {
      rotationJitter: 0,
      positionJitter: 0,
      sizeJitter: 0,
      jitterBias: 0,
      count: 100,
      size: 0,
      resolution: [0, 0]
    }
  ) {
    this.uniforms = uniforms
    this.texture = device.createTexture({
      sampler: { minFilter: 'nearest', magFilter: 'nearest' }
    })
    this.model = new Model(device, {
      vs: /*glsl*/ `
      #version 300 es
      in float instanceIndex;
      in vec2 vertex;
      in vec4 interpolation;
      
      out vec2 uv;
      out float instance;
      out vec2 tf_test;
      
      uniform sampler2D controlPoints;
      uniform float controlPointsLength;
      uniform float size;
      uniform vec2 resolution;
      uniform float jitterBias;
      uniform float rotationJitter;
      uniform float positionJitter;
      uniform float sizeJitter;

      ${hash}
      ${rotate2d}
      ${PI}
      ${catmullRomSpline}

      void main() {
        instance = float(gl_InstanceID);
        uv = vertex;

        float controlPointProgress = 1. / controlPointsLength;
        vec2 p0 = texture(controlPoints, vec2(0, 0)).xy;
        vec2 p1 = texture(controlPoints, vec2(0.25, 0)).xy;
        vec2 p2 = texture(controlPoints, vec2(0.5, 0)).xy;
        vec2 p3 = texture(controlPoints, vec2(0.75, 0)).xy;
        tf_test = p3;
        p0 = vec2(0., 0.);
        p1 = vec2(0., 0.);
        p2 = vec2(1, 1);
        p3 = vec2(1, 1);
        vec2 point = catmullRomSpline(index, p0, p1, p2, p3);
        // point = p0;

        float pointSize = size / resolution.x;
        float jitterHash = hash(point.x);
        float jitterSign = hash(point.x + 3.1432);
        float rotation = 0.;
        if (jitterSign > 0.5) jitterSign = 1.0;
        else jitterSign = -1.0;

        gl_Position = vec4(
          // rotate2d(
          //   position.xy * (pointSize + (hash(point.x + 0.8241) - 0.5) * sizeJitter * pointSize)
          //     + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize), 
          //   -rotation + (hash(point.x + 1.2341) - 0.5) * rotationJitter * PI) 
          // + point, 
          point + (vertex / (resolution / resolution.x) - 0.5) * pointSize,
          0, 1);
      }`,
      fs: /*glsl*/ `
      #version 300 es
      out vec4 fragColor;

      in vec2 uv;
      in float instance;
      
      void main() {
        // fragColor = vec4(tf_test, 1, 1);
        // fragColor = vec4(texture(controlPoints, vec2(0.5, 0)).xy, 0, 1);
        fragColor = vec4(1, 1, 1, 1);
      }`,
      attributes: {
        instanceIndex: device.createBuffer(
          new Float32Array(range(uniforms.count).map(x => x / uniforms.count))
        ),
        vertex: device.createBuffer(
          new Float32Array([0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1])
        )
      },
      uniforms,
      instanceCount: uniforms.count,
      vertexCount: 6,
      shaderLayout: {
        attributes: [
          {
            name: 'instanceIndex',
            stepMode: 'instance',
            type: 'f32',
            location: 0
          },
          { name: 'vertex', stepMode: 'vertex', type: 'vec2<f32>', location: 1 }
        ],
        bindings: []
      }
    })

    this.device = device as WebGLDevice
  }

  stroke(points: Point[], pass: RenderPass) {
    const pointsForInterpolation = [...points]
    // pointsForInterpolation.push(
    //   pointsForInterpolation[pointsForInterpolation.length - 1]
    // )
    // pointsForInterpolation.splice(0, 0, pointsForInterpolation[0])

    this.device.gl.bindTexture(
      this.device.gl.TEXTURE_2D,
      // @ts-expect-error
      this.texture['handle'] as WebGLTexture
    )
    // console.log(this.texture)
    this.device.gl.texImage2D(
      this.device.gl.TEXTURE_2D,
      0,
      this.device.gl.RGBA8,
      this.texture.width,
      this.texture.height,
      0,
      this.device.gl.RGBA,
      this.device.gl.UNSIGNED_BYTE,
      new Uint8Array(points.flat().map(x => x * 255))
    )

    // not fucking implemented...
    // const encoder = this.device.createCommandEncoder()
    // encoder.copyBufferToTexture({
    //   source: this.device.createBuffer(new Float32Array(points.flat())),
    //   destination: this.texture,
    //   bytesPerRow: this.texture.width * 4,
    //   rowsPerImage: this.texture.height,
    //   size: [this.texture.height, this.texture.width, 1]
    // })
    // encoder.finish()
    this.model.draw()
  }
}
