import { Vector2 } from 'three'
import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Keyframes from '../../src/asemic/Keyframes'

export default function Grass() {
  const kf = new Keyframes(1, 5).warp(point => {
    point.position.pull(
      point.position.origin,
      new Vector2(1, 1),
      point.position.pointProgress
    )
  })
  console.log('kf', kf.keyframes)

  return (
    <Reactive progress={t => t % 1}>
      <Asemic name='asemic'>
        <Brush
          name='brush'
          keyframes={kf.keyframes}
          size={new Vector2(2, 2)}
          alpha={0.5 / 2}
          between={[0.1, 0.9]}
        />
      </Asemic>
    </Reactive>
  )
}
