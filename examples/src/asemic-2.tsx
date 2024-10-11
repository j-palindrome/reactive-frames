import { useEffect, useRef } from 'react'
import { Brush } from '../../asemic/asemic'
import * as twgl from 'twgl.js'
import Asemic from '../../asemic/asemic'

export default function AsemicTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  useEffect(() => {
    const gl = canvasRef.current.getContext('webgl2')!
    const asemic = new Asemic(gl, device => {
      const brush = new Brush(device, {
        resolution: [window.innerWidth, window.innerHeight],
        size: 100 * devicePixelRatio,
        count: 100
      })
      const pass = asemic.beginDraw()
      brush.stroke(
        [
          [0, 0],
          [0, 0],
          [1, 1],
          [1, 1]
        ],
        pass
      )
      asemic.endDraw()
    })
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className='h-screen w-screen'
      height={window.innerHeight * window.devicePixelRatio}
      width={window.innerWidth * window.devicePixelRatio}
    />
  )
}
