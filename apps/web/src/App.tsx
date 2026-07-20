import { useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  Beaker,
  Database,
  GitBranch,
  Library,
  Menu,
  Moon,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Sun,
  X,
  Wrench,
  GitCompareArrows,
  type LucideIcon,
} from 'lucide-react';
import type { MatchCorePrefill, SingleProductPortraitPrediction, SimulatedMarketPrefill } from './types';
import Dashboard from './pages/Dashboard';
import MatchCoreWorkbench from './pages/MatchCoreWorkbench';
import ChannelObjectLibrary from './pages/ChannelObjectLibrary';
import FlywheelWorkbench from './pages/FlywheelWorkbench';
import DataManagementWorkbench from './pages/DataManagementWorkbench';
import Overview from './pages/Overview';
import ToolsWorkbench from './pages/ToolsWorkbench';
import SimulatedMarketWorkbench from './pages/SimulatedMarketWorkbench';
import PortraitComparisonWorkbench from './pages/PortraitComparisonWorkbench';

type ViewId = 'overview' | 'channel-objects' | 'match-core' | 'dashboard' | 'flywheel' | 'tools' | 'data-management' | 'simulated-market' | 'portrait-comparison';
type SubViewId = 'workbench' | 'readme';

const NAV_ITEMS: { id: ViewId; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'PLS总览', shortLabel: '总览', icon: Activity },
  { id: 'channel-objects', label: '渠道画像', shortLabel: '画像', icon: Library },
  { id: 'match-core', label: '货渠匹配', shortLabel: '匹配', icon: PackageSearch },
  { id: 'dashboard', label: '新品预测', shortLabel: '预测', icon: Sparkles },
  { id: 'simulated-market', label: '模拟市场', shortLabel: '模拟', icon: Beaker },
  { id: 'portrait-comparison', label: '画像对比', shortLabel: '对比', icon: GitCompareArrows },
  { id: 'flywheel', label: '经营飞轮', shortLabel: '飞轮', icon: GitBranch },
  { id: 'tools', label: '工具管理', shortLabel: '工具', icon: Wrench },
  { id: 'data-management', label: '数据管理', shortLabel: '数据', icon: Database },
];

const WORKSPACE_ID = 'ws_demo';
const DATA_VERSION = 'empty';

function App() {
  const [currentView, setCurrentView] = useState<ViewId>('overview');
  const [currentSku, setCurrentSku] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<SingleProductPortraitPrediction | null>(null);
  const [flywheelDecisionId, setFlywheelDecisionId] = useState<string | undefined>();
  const [simulatedMarketPrefill, setSimulatedMarketPrefill] = useState<SimulatedMarketPrefill | null>(null);
  const [matchCorePrefill, setMatchCorePrefill] = useState<MatchCorePrefill | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSubView, setActiveSubView] = useState<SubViewId>('workbench');

  useEffect(() => {
    const saved = localStorage.getItem('pls-theme');
    if (saved === 'light') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
      return;
    }
    if (saved === 'dark' || !saved || document.documentElement.classList.contains('dark')) {
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

  const navigateTo = (view: ViewId, options?: { simulatedMarketPrefill?: SimulatedMarketPrefill; matchCorePrefill?: MatchCorePrefill }) => {
    setCurrentView(view);
    setActiveSubView('workbench');
    setMobileSidebarOpen(false);
    if (options?.simulatedMarketPrefill !== undefined) {
      setSimulatedMarketPrefill(options.simulatedMarketPrefill);
    }
    if (options?.matchCorePrefill !== undefined) {
      setMatchCorePrefill(options.matchCorePrefill);
    }
  };

  const activeItem = NAV_ITEMS.find(item => item.id === currentView) ?? NAV_ITEMS[0];

  const renderNav = (compact = false) => (
    <nav className={compact ? 'app-nav app-nav--compact' : 'app-nav'}>
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const active = currentView === item.id;
        return (
          <button
            key={item.id}
            className={`app-nav__item${active ? ' app-nav__item--active' : ''}`}
            onClick={() => navigateTo(item.id)}
            title={item.label}
          >
            <Icon className="app-nav__icon" strokeWidth={1.75} aria-hidden="true" />
            <span>{compact ? item.shortLabel : item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell">
      {mobileSidebarOpen && (
        <button
          className="app-shell__scrim"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="关闭导航"
        />
      )}

      <aside className={`app-sidebar${sidebarOpen ? '' : ' app-sidebar--collapsed'}${mobileSidebarOpen ? ' app-sidebar--mobile-open' : ''}`}>
        <div className="app-sidebar__header">
          <div className="app-sidebar__brand">
            <span className="app-sidebar__mark">PLS</span>
            <span className="app-sidebar__name">PLS 工作台</span>
          </div>
          <button
            className="app-icon-btn app-sidebar__collapse"
            onClick={() => setSidebarOpen(false)}
            title="收起侧栏"
            aria-label="收起侧栏"
          >
            <PanelLeftClose size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="app-sidebar__meta">
          <span>workspace</span>
          <strong>{WORKSPACE_ID}</strong>
        </div>

        <div className="app-sidebar__section">
          <div className="app-sidebar__section-title">模块</div>
          {renderNav()}
        </div>
      </aside>

      <section className="app-frame">
        <header className="app-header">
          <div className="app-header__left">
            <button
              className="app-icon-btn app-header__open-sidebar"
              onClick={() => {
                if (window.matchMedia('(max-width: 768px)').matches) {
                  setMobileSidebarOpen(true);
                } else {
                  setSidebarOpen(true);
                }
              }}
              title="展开导航"
              aria-label="展开导航"
            >
              {sidebarOpen ? <Menu size={16} strokeWidth={1.75} /> : <PanelLeftOpen size={16} strokeWidth={1.75} />}
            </button>
            <div className="app-breadcrumb">
              <span className="app-breadcrumb__muted">PLS</span>
              <span className="app-breadcrumb__sep">/</span>
              <span className="app-breadcrumb__active">{activeItem.shortLabel}</span>
              <span className="app-breadcrumb__id">bfa2c448</span>
            </div>
            <div className="app-header__nav-strip">
              {renderNav(true)}
            </div>
          </div>

          <div className="app-header__right">
            <span className="app-header__chip">数据版 {DATA_VERSION}</span>
            <span className="app-header__chip">{WORKSPACE_ID}</span>
            <button className="app-icon-btn" onClick={toggleTheme} title="切换主题" aria-label="切换主题">
              {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
            </button>
            <button
              className="app-icon-btn app-header__mobile-menu"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="app-subheader">
          <div className="app-subheader__tabs">
            <button
              className={`app-subheader__tab${activeSubView === 'workbench' ? ' app-subheader__tab--active' : ''}`}
              onClick={() => setActiveSubView('workbench')}
            >
              工作台
            </button>
            <button
              className={`app-subheader__tab${activeSubView === 'readme' ? ' app-subheader__tab--active' : ''}`}
              onClick={() => setActiveSubView('readme')}
            >
              readme
            </button>
          </div>
          <div className="app-subheader__status">
            <span><BarChart3 size={13} strokeWidth={1.75} /> 业务智能 BI</span>
            <span>真实 API 空态</span>
          </div>
        </div>

        <main className="app-main">
          {activeSubView === 'readme' ? (
            <section className="readme-placeholder">
              <div className="readme-placeholder__header">
                <span className="status-badge status-badge--neutral">README</span>
                <h1>{activeItem.label}</h1>
                <p>这里预留当前模块的使用说明、数据前置、验收口径和常见问题。后续可以接入 Markdown 文档或模块级帮助内容。</p>
              </div>
              <div className="readme-placeholder__body">
                <div className="readme-placeholder__empty">
                  <div className="empty-state__icon">📄</div>
                  <div className="empty-state__title">暂无 readme 内容</div>
                  <p>当前仅保留入口与版式占位，不承载业务主流程。</p>
                </div>
              </div>
            </section>
          ) : (
            <>
              {currentView === 'overview' && (
                <Overview goToView={navigateTo} />
              )}
              {currentView === 'channel-objects' && (
                <ChannelObjectLibrary goToMatchCore={(prefill) => navigateTo('match-core', { matchCorePrefill: prefill })} />
              )}
              {currentView === 'match-core' && (
                <MatchCoreWorkbench
                  initialPrefill={matchCorePrefill}
                  goToFlywheel={(decisionId) => {
                    setFlywheelDecisionId(decisionId);
                    setCurrentView('flywheel');
                  }}
                  goToSimulatedMarket={(prefill) => navigateTo('simulated-market', { simulatedMarketPrefill: prefill })}
                />
              )}
              {currentView === 'dashboard' && (
                <Dashboard
                  currentSku={currentSku}
                  setCurrentSku={setCurrentSku}
                  prediction={prediction}
                  setPrediction={setPrediction}
                  goToHeatmap={() => setCurrentView('match-core')}
                  goToSimulatedMarket={(prefill) => navigateTo('simulated-market', { simulatedMarketPrefill: prefill })}
                />
              )}
              {currentView === 'flywheel' && (
                <FlywheelWorkbench initialDecisionId={flywheelDecisionId} />
              )}
              {currentView === 'simulated-market' && (
                <SimulatedMarketWorkbench
                  initialPrefill={simulatedMarketPrefill}
                  goToFlywheel={(decisionId) => {
                    setFlywheelDecisionId(decisionId);
                    setCurrentView('flywheel');
                  }}
                />
              )}
              {currentView === 'tools' && (
                <ToolsWorkbench />
              )}
              {currentView === 'data-management' && (
                <DataManagementWorkbench />
              )}
              {currentView === 'portrait-comparison' && (
                <PortraitComparisonWorkbench />
              )}
            </>
          )}
        </main>
      </section>

      {mobileSidebarOpen && (
        <button className="app-icon-btn app-sidebar__mobile-close" onClick={() => setMobileSidebarOpen(false)} aria-label="关闭导航">
          <X size={16} strokeWidth={1.75} />
        </button>
      )}

      {!sidebarOpen && (
        <button className="app-sidebar-restore" onClick={() => setSidebarOpen(true)} aria-label="展开侧栏" title="展开侧栏">
          <PanelLeftOpen size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export default App;
