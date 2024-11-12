import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const kf = new Builder(g =>
    g
      .applyTransform({ translate: [0, 0.5], push: true })
      .text('qrstuvwxyz', { width: 0.5 })
  )
    .to({}, 0)
    .to({}, 0)

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            size: [1 / 100, 1 / 100],
            a: 0.01
          }}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
