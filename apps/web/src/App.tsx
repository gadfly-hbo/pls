import { useState, useEffect } from 'react';
import type { SKU, ProductProfile } from './types';
import Dashboard from './pages/Dashboard';
import ChannelHeatmap from './pages/ChannelHeatmap';
import AccountComparison from './pages/AccountComparison';

function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'heatmap' | 'account-comparison'>('dashboard');
  const [currentSku, setCurrentSku] = useState<SKU | null>(null);
  const [prediction, setPrediction] = useState<ProductProfile | null>(null);
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
            className={currentView === 'dashboard' ? 'active' : ''} 
            onClick={() => setCurrentView('dashboard')}
          >
            新品预测工作台
          </button>
          <button 
            className={currentView === 'heatmap' ? 'active' : ''} 
            onClick={() => setCurrentView('heatmap')}
          >
            渠道匹配热力图
          </button>
          <button 
            className={currentView === 'account-comparison' ? 'active' : ''} 
            onClick={() => setCurrentView('account-comparison')}
          >
            账号画像与对比
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px', alignSelf: 'center' }} />
          <button onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? '☀️ 亮色' : '🌙 暗色'}
          </button>
        </div>
      </header>
      
      <main className="content">
        {currentView === 'dashboard' && (
          <Dashboard 
            currentSku={currentSku} 
            setCurrentSku={setCurrentSku}
            prediction={prediction}
            setPrediction={setPrediction}
            goToHeatmap={() => setCurrentView('heatmap')}
          />
        )}
        {currentView === 'heatmap' && (
          <ChannelHeatmap />
        )}
        {currentView === 'account-comparison' && (
          <AccountComparison />
        )}
      </main>
    </div>
  );
}

export default App;
