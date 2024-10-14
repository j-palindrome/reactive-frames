import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/processing'
import './src/index.css'
import TestFramerMotion from './src/framerMotionTest'
import Asemic4 from './src/asemic-4'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Asemic4 />
  </React.StrictMode>
)
