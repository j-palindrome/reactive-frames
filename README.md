# Reactive

Reactive is a flexible React wrapper for creative coding libraries, enabling easy setup and interoperability between a diverse array of packages.

Currently, Reactive includes frames for the following libraries:

**Visual**
- Canvas (WebGL)
- Canvas (2D)
- SVG
- p5.js (Processing)
- Framer Motion
- twgl.js
- Regl
- SnapSVG
- Hydra

**Audio**
- Web Audio
- Elementary Audio

# Installation
`npm install reactive-frames` 

# Usage
- Enclose everything within the main frame, `<Reactive>`. 
- Each library is a Frame component which can be passed any number of appropriate Children components.
Here is a hierarchy of allowed components:
```
<Reactive>
    <Call /> // a generic component for creating/updating props

    <Processing /> // The p5.js library, in its own canvas
    <CanvasGL> // a canvasGL instance that can adapt to window size
        <Mesh /> // A WebGL draw call using twgl.js 
        <Plane /> // A WebGL draw occupying the whole canvas
        <Framebuffer /> // A WebGL framebuffer
        <Texture /> // A WebGL texture
        <ProcessingGL /> // p5.js with a WebGL canvas you create
    </CanvasGL>
    <Canvas2D> // a canvas2D instance that can adapt to window size
        <Processing2D /> // p5.js with a 2D canvas you create
    </Canvas2D>
    <Regl /> // a regl.js instance in its own canvas
    <Hydra /> // a Hydra instance in its own canvas
    <Snap> // a Snap.svg instance
    <SVG> // a native SVG element

    <AudioCtx> // an audio Context (initialize with a button)
        <Elementary /> // Elementary audio
    </AudioCtx>
</Reactive>
```

Each component must be provided a `name`, and then can call a `setup` and a `draw` function. `Setup` is executed on page load, while `draw` is executed every frame.