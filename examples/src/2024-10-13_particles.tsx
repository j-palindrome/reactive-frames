import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { KeyframeBuilder } from '../../src/asemic/drawingSystem/KeyframeBuilder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  const kf = new KeyframeBuilder(g =>
    g.text('this is a new thing', { width: 100, origin: [0, 25] })
  )
    .to({
      translate: [0, 20],
      origin: [20, 50],
      scale: [50, 50]
    })
    .along([
      [0, 0, { reset: true }],
      [25, 25],
      [50, 0],
      [75, 100],
      [100, 0]
    ])
    .randomize({ rotate: [0, 1] })
    .to({ translate: [0, 50] }, 0)
    .randomize({ rotate: [0, 1] })

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            size: [1, 1],
            a: 25
          }}
          jitter={{
            position: [10, 0],
            size: [10, 10],
            a: 100
          }}
          flicker={
            {
              // a: 100
            }
          }
          loop
        />
      </Asemic>
    </Reactive>
  )
}
