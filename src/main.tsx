import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { DialogHost } from './components/dialogs/DialogHost'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ProtectedRoute />
    </AuthProvider>
    <DialogHost />
  </React.StrictMode>,
)
