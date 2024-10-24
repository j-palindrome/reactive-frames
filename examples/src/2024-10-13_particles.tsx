import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Keyframes from '../../src/asemic/Keyframes'
import { range } from 'lodash'
import { useKeyframes } from '../../src/asemic/useKeyframes'
import { groupArrayBy } from '../../util/src/three'

export default function ParticlesTest() {
  const points = range(5).map(() => new Vector2().random().toArray())
  // const points = []
  // for (let i = 0; i < prePoints.length; i += 2) {
  //   points.push([prePoints[i], prePoints[i + 1]])
  // }
  const keyframeInfo = useKeyframes({
    keyframes: new Keyframes(1, 5).set(points).keyframes
  })
  console.log(points)

  return (
    <Reactive progress={t => t % 1}>
      <Asemic name='a'>
        <Brush
          name='b'
          {...keyframeInfo}
          size={new Vector2(10, 10)}
          spacing={10}
        />
      </Asemic>
      <Canvas2D
        name='c2d'
        className='!w-full !h-full absolute top-0 left-0'
        draw={self => {
          self.beginPath()
          self.strokeStyle = 'red'
          self.lineWidth = 1
          for (let point of points) {
            self.lineTo(
              point[0] * window.innerWidth * 2,
              window.innerHeight * 2 - point[1] * window.innerHeight * 2
            )
          }
          self.stroke()
        }}></Canvas2D>
    </Reactive>
  )
}
