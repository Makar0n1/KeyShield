import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const isPartnerRoute = config.url?.startsWith('/partner/')
    const isManagerRoute = config.url?.startsWith('/manager/')
    const token = isPartnerRoute
      ? localStorage.getItem('partner_token')
      : isManagerRoute
        ? localStorage.getItem('managerToken')
        : localStorage.getItem('adminToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname
      if (path.startsWith('/manager')) {
        localStorage.removeItem('managerToken')
        window.location.href = '/manager/login'
      } else if (path.startsWith('/admin')) {
        localStorage.removeItem('adminToken')
        window.location.href = '/admin'
      }
    }
    return Promise.reject(error)
  }
)

export default api
