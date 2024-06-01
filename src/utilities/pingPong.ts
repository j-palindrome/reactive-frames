import { range } from 'lodash'
import * as twgl from 'twgl.js'
export default class PingPongBuffer {
  output: WebGLTexture
  input: twgl.FramebufferInfo
  index: number
  framebuffers: [twgl.FramebufferInfo, twgl.FramebufferInfo]
  gl: WebGL2RenderingContext
  constructor(options: twgl.TextureOptions, gl: WebGL2RenderingContext) {
    this.gl = gl
    this.index = 0
    this.framebuffers = range(2).map(() => {
      const newTexture = twgl.createTexture(gl, {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        min: gl.NEAREST,
        mag: gl.NEAREST,
        ...options
      })
      twgl.setTextureParameters(gl, newTexture, {
        min: gl.NEAREST,
        mag: gl.NEAREST
      })
      return twgl.createFramebufferInfo(
        gl,
        [newTexture],
        options.width ?? gl.drawingBufferWidth,
        options.height ?? gl.drawingBufferHeight
      )
    }) as PingPongBuffer['framebuffers']
    this.input = this.framebuffers[0]
    this.output = this.framebuffers[this.index].attachments[0]
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
