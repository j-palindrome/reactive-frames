import CanvasComponent, { extractCanvasProps } from '../blocks/CanvasComponent'
import {
  FrameComponent,
  defineChildComponent
} from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import type p5 from 'p5'
import { useEffect, useRef, useState } from 'react'
import { CanvasComponentProps, ParentProps } from '../types'

const Processing = (
  props: ParentProps<
    CanvasComponentProps & {
      type: 'p2d' | 'webgl'
    },
    p5
  >
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const pRef = useRef<any>(null!)

  return (
    <>
      <CanvasComponent
        ref={canvasRef}
        {...extractCanvasProps(props)}
        webgl={props.type === 'webgl'}
        onResize={canvas => {
          if (!pRef.current) return
          pRef.current.resizeCanvas(canvas.width, canvas.height)
        }}
      />
      <FrameComponent
        options={omit(props, 'children')}
        getSelf={async options => {
          const p5 = await import('p5')

          return new p5.default((p: p5) => {
            pRef.current = p
            // disable draw and setup, they get handled in the previous contexts
            p.setup = () => {
              p.noLoop()
              p.createCanvas(
                canvasRef.current.width,
                canvasRef.current.height,
                options.type,
                canvasRef.current
              )
            }
          })
        }}>
        {props.children}
      </FrameComponent>
    </>
  )
}

export default Processing

export const ProcessingGL = defineChildComponent(
  async (options = {}, gl: WebGL2RenderingContext) => {
    const p5 = await import('p5')
    return new p5.default((p: p5) => {
      p.setup = () => {
        p.noLoop()
        p.createCanvas(gl.canvas.width, gl.canvas.height, p.WEBGL, gl.canvas)
      }
      p.windowResized = () => {
        p.resizeCanvas(gl.drawingBufferWidth, gl.drawingBufferHeight)
      }
    })
  }
)

export const Processing2D = defineChildComponent(
  async (options = {}, ctx: CanvasRenderingContext2D) => {
    const p5 = await import('p5')
    return new p5.default((p: p5) => {
      p.setup = () => {
        p.noLoop()
        p.createCanvas(ctx.canvas.width, ctx.canvas.height, p.P2D, ctx.canvas)
      }
    })
  }
)
