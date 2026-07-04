import { useState, useEffect } from 'react';
import type { SKU, ProductProfile } from './types';
import Dashboard from './pages/Dashboard';
import MatchCoreWorkbench from './pages/MatchCoreWorkbench';
import AccountProfileWorkbench from './pages/AccountProfileWorkbench';
import FlywheelWorkbench from './pages/FlywheelWorkbench';
import DataManagementWorkbench from './pages/DataManagementWorkbench';

type ViewId = 'account-workbench' | 'match-core' | 'dashboard' | 'flywheel' | 'data-management';

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'account-workbench', label: '实体与账号画像' },
  { id: 'match-core', label: '人货匹配核心工作台' },
  { id: 'dashboard', label: '新品预测工作台' },
  { id: 'flywheel', label: '经营飞轮' },
  { id: 'data-management', label: '数据管理' },
];

function App() {
  const [currentView, setCurrentView] = useState<ViewId>('account-workbench');
  const [currentSku, setCurrentSku] = useState<SKU | null>(null);
  const [prediction, setPrediction] = useState<ProductProfile | null>(null);
  const [flywheelDecisionId, setFlywheelDecisionId] = useState<string | undefined>();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pls-theme');
    if (saved === 'dark' || (!saved && document.documentElement.classList.contains('dark'))) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('pls-theme', newTheme);
  };

  const navigateTo = (view: ViewId) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__left">
          <span className="app-header__brand">PLS 工作台</span>
          <span className="app-header__env-badge">ws_demo</span>
        </div>

        {/* Desktop nav */}
        <nav className="app-nav app-nav--desktop">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`app-nav__item${currentView === item.id ? ' app-nav__item--active' : ''}`}
              onClick={() => navigateTo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="app-header__right">
          <button className="app-header__theme-btn" onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="app-header__hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="菜单"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {mobileMenuOpen && (
        <nav className="app-nav app-nav--mobile">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`app-nav__item${currentView === item.id ? ' app-nav__item--active' : ''}`}
              onClick={() => navigateTo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <main className="app-main">
        {currentView === 'account-workbench' && (
          <AccountProfileWorkbench />
        )}
        {currentView === 'match-core' && (
          <MatchCoreWorkbench
            goToFlywheel={(decisionId) => {
              setFlywheelDecisionId(decisionId);
              setCurrentView('flywheel');
            }}
          />
        )}
        {currentView === 'dashboard' && (
          <Dashboard
            currentSku={currentSku}
            setCurrentSku={setCurrentSku}
            prediction={prediction}
            setPrediction={setPrediction}
            goToHeatmap={() => setCurrentView('match-core')}
          />
        )}
        {currentView === 'flywheel' && (
          <FlywheelWorkbench initialDecisionId={flywheelDecisionId} />
        )}
        {currentView === 'data-management' && (
          <DataManagementWorkbench />
        )}
      </main>
    </div>
  );
}

export default App;
