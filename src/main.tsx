import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ProtectedRoute />
    </AuthProvider>
  </React.StrictMode>,
)
