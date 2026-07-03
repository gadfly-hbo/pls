import { useState, useEffect } from 'react';
import type { SKU, ProductProfile } from './types';
import Dashboard from './pages/Dashboard';
import MatchCoreWorkbench from './pages/MatchCoreWorkbench';
import AccountProfileWorkbench from './pages/AccountProfileWorkbench';
import FlywheelWorkbench from './pages/FlywheelWorkbench';
import DataManagementWorkbench from './pages/DataManagementWorkbench';

function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'match-core' | 'account-workbench' | 'flywheel' | 'data-management'>('account-workbench');
  const [currentSku, setCurrentSku] = useState<SKU | null>(null);
  const [prediction, setPrediction] = useState<ProductProfile | null>(null);
  const [flywheelDecisionId, setFlywheelDecisionId] = useState<string | undefined>();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
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

  return (
    <div className="layout">
      <header className="header">
        <div className="logo" style={{ fontSize: '18px', fontWeight: 'bold' }}>PLS 工作台</div>
        <div className="header-nav">
          <button 
            className={currentView === 'account-workbench' ? 'active' : ''} 
            onClick={() => setCurrentView('account-workbench')}
          >
            实体与账号画像
          </button>
          <button 
            className={currentView === 'match-core' ? 'active' : ''} 
            onClick={() => setCurrentView('match-core')}
          >
            人货匹配核心工作台
          </button>
          <button 
            className={currentView === 'dashboard' ? 'active' : ''} 
            onClick={() => setCurrentView('dashboard')}
          >
            新品预测工作台
          </button>
          <button 
            className={currentView === 'flywheel' ? 'active' : ''} 
            onClick={() => setCurrentView('flywheel')}
          >
            经营飞轮
          </button>
          <button 
            className={currentView === 'data-management' ? 'active' : ''} 
            onClick={() => setCurrentView('data-management')}
          >
            数据管理
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px', alignSelf: 'center' }} />
          <button onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? '☀️ 亮色' : '🌙 暗色'}
          </button>
        </div>
      </header>
      
      <main className="content">
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
