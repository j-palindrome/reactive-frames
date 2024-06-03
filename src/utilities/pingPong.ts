import { range } from 'lodash'
import * as twgl from 'twgl.js'
export default class PingPongBuffer {
  output: WebGLTexture
  input: twgl.FramebufferInfo
  index: number
  framebuffers: [twgl.FramebufferInfo, twgl.FramebufferInfo]
  gl: WebGL2RenderingContext
  constructor(
    options: {
      options?: (gl: WebGL2RenderingContext) => twgl.TextureOptions
      width?: number
      height?: number
      depth?: number
      startData?: number[] | (() => number[])
    },
    gl: WebGL2RenderingContext
  ) {
    this.gl = gl
    this.index = 0
    let glOptions = options.options ? options.options(this.gl) : undefined
    const fullTextureOptions = {
      width: options.width ?? gl.drawingBufferWidth,
      height: options.height ?? gl.drawingBufferHeight,
      depth: options.depth,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      ...glOptions
    }
    this.framebuffers = range(2).map(() => {
      const newTexture = twgl.createTexture(gl, fullTextureOptions)
      return twgl.createFramebufferInfo(
        gl,
        [newTexture],
        options.width ?? gl.drawingBufferWidth,
        options.height ?? gl.drawingBufferHeight
      )
    }) as PingPongBuffer['framebuffers']
    this.input = this.framebuffers[0]
    this.output = this.framebuffers[this.index].attachments[0]

    if (options.startData) {
      for (let buffer of this.framebuffers) {
        twgl.setTextureFromArray(
          this.gl,
          buffer.attachments[0],
          typeof options.startData === 'function'
            ? options.startData()
            : options.startData,
          {
            width: options.width ?? gl.drawingBufferWidth,
            height: options.height ?? gl.drawingBufferHeight,
            depth: options.depth
          }
        )
        twgl.setTextureParameters(
          this.gl,
          buffer.attachments[0],
          fullTextureOptions
        )
      }
    }
  }

  bind() {
    // switch output to the currently rendered buffer and input to the empty one
    this.output = this.framebuffers[this.index].attachments[0]
    this.index = this.index ? 0 : 1
    this.input = this.framebuffers[this.index]

    twgl.bindFramebufferInfo(this.gl, this.input)
  }

  unbind() {
    twgl.bindFramebufferInfo(this.gl, null)
  }
}
