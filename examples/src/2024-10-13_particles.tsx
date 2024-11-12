import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const kf = new Builder(g =>
    g.text('abcdefghijklmnopqrstuvwxyz', { width: 1 })
  )
    .to(
      {
        translate: [0, 0.5]
      },
      0
    )
    .groups((g, p) => {
      p.applyTransformData(p.toTransformData({ rotate: 2 }), g.transform)
    })
    .to({}, 0)
[]
  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            a: 0.01
          }}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
