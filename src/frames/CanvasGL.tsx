import _, { omit, range, sumBy } from 'lodash'
import { useRef } from 'react'
import * as twgl from 'twgl.js'
import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import {
  ChildComponentDefinition,
  FrameComponent,
  defineChildComponent
} from '../blocks/FrameChildComponents'
import { Layer as LayerInstance } from '../utilities/layer'
import {
  cubicBezier,
  cubicBezierNormal,
  defaultVert2DNoResolution
} from '../utilities/shaders'
import { CanvasComponentProps, ParentProps, ReactiveContext } from '../types'
import PingPongBufferInstance from '../utilities/pingPong'

const CanvasGL = (
  props: ParentProps<
    Omit<CanvasComponentProps, 'type'> & {
      glOptions?: WebGLContextAttributes
    },
    WebGL2RenderingContext
  >
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  return (
    <>
      <CanvasComponent ref={canvasRef} {...extractCanvasProps(props)} webgl />
      <FrameComponent
        options={omit(props, 'children')}
        getSelf={options => {
          const gl = canvasRef.current.getContext('webgl2', options.glOptions)!
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
          return gl
        }}>
        {props.children}
      </FrameComponent>
    </>
  )
}
export default CanvasGL

export const Framebuffer = defineChildComponent(
  (
    options: {
      attachments?: Parameters<(typeof twgl)['createFramebufferInfo']>[1]
      width?: number
      height?: number
    },
    context: WebGL2RenderingContext
  ) => {
    const framebuffer = twgl.createFramebufferInfo(
      context,
      options.attachments ?? [{}],
      options.width ?? context.drawingBufferWidth,
      options.height ?? context.drawingBufferHeight
    )
    return framebuffer
  },
  (self, gl) => {
    twgl.bindFramebufferInfo(gl, self)
  }
)

export const PingPongBuffer = defineChildComponent(
  (
    options: ConstructorParameters<typeof PingPongBufferInstance>[0],
    gl: WebGL2RenderingContext
  ) => {
    console.log('creating buffer')

    return new PingPongBufferInstance(options, gl)
  },
  self => {
    self.bind()
  }
)

export const Texture = defineChildComponent(
  (
    options: {
      options?: (gl: WebGL2RenderingContext) => twgl.TextureOptions
      width?: number
      height?: number
    },
    gl: WebGL2RenderingContext
  ) => {
    const texOptions = options.options ? options.options(gl) : undefined
    const texture = twgl.createTexture(gl, {
      width: options.width ?? gl.drawingBufferWidth,
      height: options.height ?? gl.drawingBufferHeight,
      ...texOptions
    })
    return texture
  }
)

export const Mesh = defineChildComponent(
  (
    options: Omit<ConstructorParameters<typeof LayerInstance>[0], 'gl'>,
    context: WebGL2RenderingContext
  ) => {
    return new LayerInstance({ ...options, gl: context })
  },
  (self, frame, options) => {
    self.draw()
  }
)

/**
 * Returns a Mesh with positions at each of the four corners, only requiring code for a fragment shader.
 */
export const Plane = defineChildComponent(
  (
    options: Omit<
      ConstructorParameters<typeof LayerInstance>[0],
      'gl' | 'attributes' | 'vertexShader'
    > & {
      xywh?: [number, number, number, number]
    },
    context: WebGL2RenderingContext
  ) => {
    const xywh = options.xywh
    const data = xywh
      ? [
          xywh[0],
          xywh[1],
          xywh[0] + xywh[2],
          xywh[1],
          xywh[0],
          xywh[1] - xywh[3],
          xywh[0] + xywh[2],
          xywh[1] - xywh[3]
        ]
      : [-1, 1, 1, 1, -1, -1, 1, -1]

    let compiledFragmentShader: string
    const addedUniforms: string[] = []
    if (!options.fragmentShader.includes('in vec2 uv;'))
      addedUniforms.push('in vec2 uv;')
    else if (!options.fragmentShader.includes('uniform vec2 resolution'))
      addedUniforms.push('uniform vec2 resolution;')
    if (options.fragmentShader.includes('precision highp float;')) {
      compiledFragmentShader = options.fragmentShader.replace(
        'precision highp float;',
        `precision highp float;\n${addedUniforms.join('\n')}`
      )
    } else {
      compiledFragmentShader = addedUniforms.join('\n') + options.fragmentShader
    }

    return new LayerInstance({
      ...options,
      attributes: {
        position: {
          data,
          numComponents: 2
        }
      },
      uniforms: {
        resolution: [context.drawingBufferWidth, context.drawingBufferHeight]
      },
      vertexShader: defaultVert2DNoResolution,
      fragmentShader: compiledFragmentShader,
      drawMode: 'triangle strip',
      gl: context
    })
  }
)

export const VideoPlane = defineChildComponent(
  (
    options: {
      xywh?: [number, number, number, number]
      source?:
        | WebGLTexture
        | ((context: ReactiveContext) => WebGLTexture)
        | string
    },
    context: WebGL2RenderingContext
  ) => {
    const xywh = options.xywh
    const data = xywh
      ? [
          xywh[0],
          xywh[1],
          xywh[0] + xywh[2],
          xywh[1],
          xywh[0],
          xywh[1] - xywh[3],
          xywh[0] + xywh[2],
          xywh[1] - xywh[3]
        ]
      : [-1, 1, 1, 1, -1, -1, 1, -1]
    const layer = new LayerInstance({
      ...options,
      attributes: {
        position: {
          data,
          numComponents: 2
        }
      },
      uniforms: {
        resolution: [context.drawingBufferWidth, context.drawingBufferHeight]
      },
      vertexShader: defaultVert2DNoResolution,
      fragmentShader: /*glsl*/ `
        in vec2 uv;
        uniform vec2 resolution;
        uniform sampler2D source;
        void main() {
          fragColor = texture(source, uv);
        }`,
      drawMode: 'triangle strip',
      gl: context
    })
    return layer
  },
  (self, frame, context, options) => {
    self.draw({
      source:
        typeof options.source === 'string'
          ? context.elements[options.source]
          : typeof options.source === 'function'
          ? options.source(context)
          : options.source
    })
  }
)

type Point = [number, number]
type Curves = { start: Point; direction: Point; width: number }[][]
export const MeshCurve = defineChildComponent(
  (
    options: {
      curves?: Curves
      subdivisions: number
      fragmentShader: string
    },
    gl: WebGL2RenderingContext
  ) => {
    const generateAttributes = (curves: Curves) => {
      // 40.3 ms
      let startIndex = 0
      let indexIndex = 0
      const vertexNumber = _.sumBy(
        curves,
        x => (x.length - 1) * options.subdivisions * 2
      )
      const attributes = {
        p0: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        thisControl: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        nextControl: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        p3: { numComponents: 2, data: new Float32Array(vertexNumber * 2) },
        w0: { numComponents: 1, data: new Float32Array(vertexNumber) },
        w1: { numComponents: 1, data: new Float32Array(vertexNumber) },
        direction: { numComponents: 1, data: new Float32Array(vertexNumber) },
        t: { numComponents: 1, data: new Float32Array(vertexNumber) },
        indices: {
          data: new Uint32Array(
            sumBy(curves, x => (x.length - 1) * options.subdivisions - 2) * 6
          )
        }
      }
      for (let index = 0; index < curves.length; index++) {
        for (
          let i = startIndex;
          i <
          (curves[index].length - 1) * options.subdivisions + startIndex - 2;
          i += 2
        ) {
          attributes.indices.data.set(
            [i, i + 1, i + 2, i + 1, i + 2, i + 3],
            indexIndex
          )
          indexIndex += 6
        }
        for (let i = 0; i < curves[index].length - 1; i++) {
          const thisPoint = curves[index][i]
          const nextPoint = curves[index][i + 1]
          const fullPoint = {
            thisControl: thisPoint.direction,
            nextControl: nextPoint.direction,
            p0: thisPoint.start,
            p3: nextPoint.start,
            w0: thisPoint.width,
            w1: nextPoint.width
          }
          for (let t = 0; t < options.subdivisions; t++) {
            const thisT = t / options.subdivisions
            attributes.t.data.set([thisT, thisT], startIndex)
            attributes.thisControl.data.set(
              [...fullPoint.thisControl, ...fullPoint.thisControl],
              startIndex * 2
            )
            attributes.nextControl.data.set(
              [...fullPoint.nextControl, ...fullPoint.nextControl],
              startIndex * 2
            )
            attributes.p0.data.set(
              [...fullPoint.p0, ...fullPoint.p0],
              startIndex * 2
            )
            attributes.p3.data.set(
              [...fullPoint.p3, ...fullPoint.p3],
              startIndex * 2
            )
            attributes.w0.data.set([fullPoint.w0, fullPoint.w0], startIndex)
            attributes.w1.data.set([fullPoint.w1, fullPoint.w1], startIndex)
            attributes.direction.data.set([0, 1], startIndex)
            startIndex += 2
          }
        }
      }
      return attributes
    }

    const curve = new LayerInstance({
      gl,
      attributes: options.curves
        ? generateAttributes(options.curves)
        : {
            p0: {
              numComponents: 2
            },
            thisControl: { numComponents: 2 },
            nextControl: { numComponents: 2 },
            p3: { numComponents: 2 },
            w0: { numComponents: 1 },
            w1: { numComponents: 1 },
            direction: { numComponents: 1 },
            t: { numComponents: 1 },
            indices: { numComponents: 1 }
          },
      vertexShader: /*glsl*/ `
        in vec2 p0;
        in vec2 p3;
        in vec2 thisControl;
        in vec2 nextControl;
        in float t;
        in float w0;
        in float w1;
        in float direction;
        out vec2 uv;

        ${cubicBezier}
        ${cubicBezierNormal}
        
        void main() {
          vec2 p1 = p0 + thisControl;
          vec2 p2 = nextControl * -1.0 + p3;
          vec2 pos = cubicBezier(t, p0, p1, p2, p3);
          vec2 normal = cubicBezierNormal(t, p0, p1, p2, p3);
          vec2 nextNormal = cubicBezierNormal(min(t + 0.01, 1.0), p0, p1, p2, p3);
          
          float width = w0 + (w1 - w0) * t;
          
          float miter = length(cross(vec3(normal, 0.0), vec3(nextNormal, 0.0)));
          // gl_Position = vec4(pos + normal * direction * width, 0, 1);
          gl_Position = vec4(pos + normal * direction * width * (1.0 - miter), 0, 1);
        }
      `,
      fragmentShader: options.fragmentShader
    })
    return {
      draw: (curves?: Curves, uniforms?: Record<string, any>) =>
        curve.draw(uniforms, curves ? generateAttributes(curves) : undefined)
    }
  },
  self => self.draw()
)

export const LineCurve = defineChildComponent(
  (
    options: {
      curves?: Curves
      subdivisions: number
      fragmentShader: string
    },
    gl: WebGL2RenderingContext
  ) => {
    const generateAttributes = (curves: Curves) => {
      // 8.79 ms to render 1000
      let startIndex = 0
      const vertexNumber = _.sumBy(
        curves,
        x => (x.length - 1) * options.subdivisions
      )
      const attributes = {
        p0: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        thisControl: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        nextControl: {
          numComponents: 2,
          data: new Float32Array(vertexNumber * 2)
        },
        p3: { numComponents: 2, data: new Float32Array(vertexNumber * 2) },
        t: { numComponents: 1, data: new Float32Array(vertexNumber) }
      }
      for (let index = 0; index < curves.length; index++) {
        for (let i = 0; i < curves[index].length - 1; i++) {
          const thisPoint = curves[index][i]
          const nextPoint = curves[index][i + 1]
          const fullPoint = {
            thisControl: thisPoint.direction,
            nextControl: nextPoint.direction,
            p0: thisPoint.start,
            p3: nextPoint.start
          }
          for (let t = 0; t < options.subdivisions; t++) {
            const thisT = t / options.subdivisions
            attributes.t.data[startIndex] = thisT
            attributes.thisControl.data.set(
              fullPoint.thisControl,
              startIndex * 2
            )
            attributes.nextControl.data.set(
              fullPoint.nextControl,
              startIndex * 2
            )
            attributes.p0.data.set(fullPoint.p0, startIndex * 2)
            attributes.p3.data.set(fullPoint.p3, startIndex * 2)
            startIndex++
          }
        }
      }
      return attributes
    }

    const curve = new LayerInstance({
      gl,
      drawMode: 'line strip',
      attributes: options.curves
        ? generateAttributes(options.curves)
        : {
            p0: {
              numComponents: 2
            },
            thisControl: { numComponents: 2 },
            nextControl: { numComponents: 2 },
            p3: { numComponents: 2 },
            t: { numComponents: 1 }
          },
      vertexShader: /*glsl*/ `
        in vec2 p0;
        in vec2 p3;
        in vec2 thisControl;
        in vec2 nextControl;
        in float t;
        out vec2 uv;

        ${cubicBezier}
        
        void main() {
          vec2 p1 = p0 + thisControl;
          vec2 p2 = nextControl * -1.0 + p3;
          vec2 pos = cubicBezier(t, p0, p1, p2, p3);
          gl_Position = vec4(pos, 0, 1);
        }
      `,
      fragmentShader: options.fragmentShader
    })
    return {
      draw: (curves?: Curves, uniforms?: Record<string, any>) =>
        curve.draw(uniforms, curves ? generateAttributes(curves) : undefined)
    }
  },
  self => self.draw()
)
