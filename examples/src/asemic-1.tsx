import { useEffect, useRef } from 'react'
import { Brush } from '../../src/asemic/Asemic'
import * as twgl from 'twgl.js'

export default function AsemicTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  useEffect(() => {
    const gl = canvasRef.current.getContext('webgl2')!
    const asemic = new Brush(gl)
    const draw = (time: number) => {
      gl.clear(gl.COLOR_BUFFER_BIT)
      asemic.stroke(
        [
          [0, 0],
          [0, 0],
          [1, 1],
          [1, 1]
        ],
        {
          resolution: [window.innerWidth, window.innerHeight],
          size: 100 * devicePixelRatio,
          count: 100,
          time,
          ...asemic.uniforms
        }
      )

      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
    // console.log(
    //   // twgl.getGLTypeForTypedArray(new Float32Array()),
    //   twgl.getFormatAndTypeForInternalFormat(gl.RGBA32F),
    //   twgl.glEnumToString(gl, 6408)
    // )
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
