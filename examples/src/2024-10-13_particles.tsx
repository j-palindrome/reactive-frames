import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { Keyframes } from '../../src/asemic/drawingSystem/Keyframes'

export default function ParticlesTest() {
  const kf = new Keyframes([
    // g =>
    //   g
    //     .letter('e')
    //     .targetCurve(0, -1)
    //     .eachPoint(p => p.addScalar(0.5)),
    g => g.letter('k')
  ])

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          size={[1, 1]}
          // jitter={{
          //   position: [100, 0]
          // }}
          loop
        />
      </Asemic>
    </Reactive>
  )
}
