import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import i18n from './lib/i18n'

const Catalogue = lazy(() => import('./components/catalogue/Catalogue').then(m => ({ default: m.Catalogue })))
const CaptureScreen = lazy(() => import('./components/capture/CaptureScreen').then(m => ({ default: m.CaptureScreen })))
const ReportView = lazy(() => import('./components/report/ReportView').then(m => ({ default: m.ReportView })))
const BuilderWizard = lazy(() => import('./components/builder/BuilderWizard').then(m => ({ default: m.BuilderWizard })))

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      fontFamily: 'var(--font-data)',
      color: 'var(--ink-3)',
      fontSize: 11,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      gap: 'var(--space-3)',
    }}>
      <span style={{
        width: 12, height: 12,
        borderRadius: '50%',
        background: 'var(--accent-2)',
        boxShadow: '0 0 18px var(--accent-2)',
        animation: 'breathe 1.8s ease-in-out infinite',
      }} />
      {i18n.t('common.loading')}
    </div>
  )
}

function LangWrapper() {
  const { lang } = useParams<{ lang: string }>()
  useEffect(() => {
    if (lang === 'fr' || lang === 'en') {
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang)
        localStorage.setItem('lang', lang)
      }
    }
  }, [lang])
  return <Outlet />
}

const defaultLang = (localStorage.getItem('lang') ?? 'fr') as string

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/:lang" element={<LangWrapper />}>
            <Route path="app" element={<Catalogue />} />
            <Route path="app/:sport" element={<Catalogue />} />
            <Route path="app/:sport/:gesture/capture" element={<CaptureScreen />} />
            <Route path="app/:sport/:gesture/report" element={<ReportView />} />
            <Route path="builder" element={<BuilderWizard />} />
            <Route path="builder/:scriptId" element={<BuilderWizard />} />
          </Route>
          <Route path="*" element={<Navigate to={`/${defaultLang}/app`} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
