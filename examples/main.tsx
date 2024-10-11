import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/processing'
import './src/index.css'
import TestFramerMotion from './src/framerMotionTest'
import AsemicTest from './src/asemic'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AsemicTest />
  </React.StrictMode>
)
