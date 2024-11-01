import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { Keyframes } from '../../src/asemic/drawingSystem/Keyframes'

export default function ParticlesTest() {
  const kf = new Keyframes(
    // g => g.letter('z'))
    g => g.text('a')
  )
    .targetGroups(0, -1)
    // .eachPoint(p => p.add({ x: 0, y: 1 / 2 }))
    .targetGroups(-1)
    .debug()
  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          setup={(self, parent) => {}}
          keyframes={kf}
          name='b'
          size={[1, 1]}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
