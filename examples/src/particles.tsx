import { Vector2 } from 'three'
import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush, { useKeyframes } from '../../src/asemic/Brush'
import Keyframes from '../../src/asemic/Keyframes'

export default function ParticlesTest() {
  const keyframeInfo = useKeyframes({
    keyframes: new Keyframes(1, 5).set([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0]
    ]).keyframes
  })

  console.log(
    new Keyframes(1, 3).set([
      [0, 0],
      [0, 1],
      [1, 1]
    ]).keyframes
  )

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
    </Reactive>
  )
}
