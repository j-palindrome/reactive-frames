import Hydra from 'hydra-synth'
import { useEffect, useRef, useState } from 'react'
import { Reactive } from '../../../src'
import { useEventListener } from '../../../src/utilities/react'
import { Slide } from './SlideDeck'
import Asemic from '../../../src/asemic/Asemic'
import Brush from '../../../src/asemic/Brush'
import Builder from '../../../src/asemic/drawingSystem/Builder'

export default function DigiRis() {
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const hydraRef = useRef<Hydra>(null!)
  useEffect(() => {
    const hydra = new Hydra({
      canvas: canvasRef.current,
      makeGlobal: false,
      width: window.innerWidth * devicePixelRatio,
      height: window.innerHeight * devicePixelRatio
    })
    hydra.synth.s0.initCam()
    hydraRef.current = hydra
  }, [])

  const [currentChild, setCurrentChild] = useState(0)
  const allChildren = 4
  useEventListener(
    'keydown',
    ev => {
      console.log(ev.key)

      switch (ev.key) {
        case 'ArrowLeft':
          setCurrentChild((currentChild - 1) % allChildren)
          break
        case 'ArrowRight':
          setCurrentChild((currentChild + 1) % allChildren)
          break
      }
    },
    [currentChild]
  )

  const slides: {
    hydra: (h: Hydra['synth']) => Hydra['synth']
    asemic: JSX.Element
    slide: JSX.Element
  }[] = [
    {
      hydra: src => src.saturate(0).invert().thresh(0.5),
      asemic: (
        <Brush render={b => b.text('abcdefghijklmnopqrstuvwxyz').debug()} />
      ),
      slide: <></>
    },
    {
      hydra: src => src.saturate(0).invert().thresh(0.5),
      asemic: <></>,
      slide: (
        <Slide>
          <p>
            "Human beings, like any other component or subsystem, must be
            localized in a system architecture whose basic modes operation are
            probabilistic, statistical. No objects, spaces, or bodies are sacred
            in themselves; any component can be interfaced with any other of the
            proper standard, the proper code, can be constructed for processing
            signals in a common language."
          </p>
        </Slide>
      )
    },
    {
      hydra: src => src.saturate(0).invert().thresh(0.5),
      asemic: <></>,
      slide: (
        <Slide>
          <p>
            “Looking through these veils of race and gender but never being
            fully seen myself, with limited reference points in the world
            beyond, I was distanced from any accurate mirror. For my body, then,
            subversion came via digital remix, searching for those sites of
            experimentation where I could explore my true self, open and ready
            to be read by those who spoke my language. Online, I sought to
            become a fugitive from the mainstream, unwilling to accept its
            limited definition of bodies like my own. What the world AFK offered
            was not enough. I wanted—demanded—more.”
          </p>
        </Slide>
      )
    },
    {
      hydra: src => src.saturate(0).invert().thresh(0.5),
      asemic: <></>,
      slide: (
        <Slide>
          “The glitch posits: One is not born, but rather becomes, a body.
          Though the artifice of a simple digital Shangri-La—a world online
          where we could all finally be “freed” from the mores of gender, as
          dreamt of by early cyberfeminists—is now punctured, the Internet still
          remains a vessel through which a “becoming” can realize itself.”
          (Introduction)
        </Slide>
      )
    }
  ]

  useEffect(() => {
    const hydra = hydraRef.current.synth
    slides[currentChild].hydra(hydra.src(hydra.s0)).out()
  }, [currentChild])

  return (
    <>
      <div className='h-full w-full absolute top-0 left-0'>
        <canvas ref={canvasRef} className='h-full w-full' />
      </div>
      <Asemic>{slides[currentChild].asemic}</Asemic>
      <div className='text-pink-600 z-10 absolute top-0 left-0 h-full w-full font-mono font-bold'>
        {slides[currentChild].slide}
      </div>
    </>
  )
}
