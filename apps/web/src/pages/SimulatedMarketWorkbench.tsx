import { useEffect, useMemo, useState } from 'react';
import {
  Beaker,
  ChevronRight,
  FileText,
  History,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Users,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  ChannelObject,
  SimulationRun,
  TargetUserAgent,
  SimulatedMarketInput,
  SimulatedMarketAgentFeedback,
  SimulatedMarketPrefill,
} from '../types';

const REAL_CHANNEL_OBJECT_EXAMPLES: Record<'channelEntityId' | 'marketingEventId' | 'businessScenarioId', string> = {
  channelEntityId: 'account:mock_account_douyin_style',
  marketingEventId: 'marketing_event:mock_event_618',
  businessScenarioId: 'business_scenario:new_product_launch:mock_style',
};

const MARKET_CONTEXT_LABELS: Record<keyof SimulatedMarketInput['marketContext'], string> = {
  channelEntityId: '渠道对象 ID',
  marketingEventId: '营销活动 ID',
  businessScenarioId: '业务场景 ID',
  contextText: '场景补充说明',
};

type ViewTab = 'config' | 'history';

const SOURCE_TYPE_OPTIONS: { value: SimulatedMarketInput['sourceType']; label: string }[] = [
  { value: 'manual_strategy', label: '手动输入策略' },
  { value: 'single_product_portrait', label: '单品画像预测' },
  { value: 'product_channel_match', label: '人货匹配结果' },
  { value: 'campaign_product_strategy', label: '活动商品策略' },
];

const DEFAULT_STRATEGY_TEXT =
  '本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭，定价中档，计划通过抖音直播间与天猫旗舰店同步首发。';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

function getStatusBadgeClass(status: SimulationRun['status']): string {
  switch (status) {
    case 'succeeded':
      return 'status-badge status-badge--success';
    case 'failed':
      return 'status-badge status-badge--danger';
    case 'running':
      return 'status-badge status-badge--warning';
    default:
      return 'status-badge status-badge--neutral';
  }
}

function getAgentInitial(name: string): string {
  const match = name.match(/[A-C]/);
  return match ? match[0] : name.charAt(0);
}

function isLlmAgentRun(run: SimulationRun): boolean {
  return run.provider === 'minimax' && run.modelVersion === 'minimax-m3';
}

function isFallbackRun(run: SimulationRun): boolean {
  return run.qualityFlags.some((flag) => flag.includes('fallback'));
}

function ProviderBadge({ run }: { run: SimulationRun }) {
  if (isLlmAgentRun(run)) {
    return (
      <span className="sim-provider-badge sim-provider-badge--llm">
        <Sparkles size={12} />
        LLM agent 模拟
      </span>
    );
  }
  return (
    <span className="sim-provider-badge sim-provider-badge--fallback">
      <AlertTriangle size={12} />
      {run.provider}
    </span>
  );
}

function FallbackWarning({ run }: { run: SimulationRun }) {
  if (!isFallbackRun(run)) return null;
  return (
    <div className="alert-banner alert-banner--warning">
      <AlertTriangle size={16} />
      <span>当前运行使用 deterministic fallback 兜底，不是 LLM agent 模拟结果。结果属于 Derived Result，不承诺真实市场反馈。</span>
    </div>
  );
}

type MarketContextKey = keyof SimulatedMarketInput['marketContext'];

function MarketContextSelector({
  field,
  value,
  options,
  onChange,
  placeholder,
}: {
  field: MarketContextKey;
  value: string;
  options: ChannelObject[];
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const selected = options.find((o) => o.canonicalObjectKey === value);
  const selectValue = selected ? value : '';

  return (
    <div className="sim-market-context-row">
      <select
        className="form-control sim-market-context-row__select"
        data-testid={`market-context-select-${field}`}
        value={selectValue}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">手动输入 / 未选择</option>
        {options.map((o) => (
          <option key={o.canonicalObjectKey} value={o.canonicalObjectKey}>
            {o.displayName} ({o.canonicalObjectKey})
          </option>
        ))}
      </select>
      <input
        className="form-control sim-market-context-row__input"
        data-testid={`market-context-input-${field}`}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function getAgentColorClass(name: string): string {
  if (name.includes('A')) return 'sim-agent-card--a';
  if (name.includes('B')) return 'sim-agent-card--b';
  if (name.includes('C')) return 'sim-agent-card--c';
  return 'sim-agent-card--manual';
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  const safe = Math.min(100, Math.max(0, value));
  const color = safe >= 65 ? 'var(--success)' : safe >= 45 ? 'var(--warning)' : 'var(--destructive)';
  return (
    <div className="sim-score-ring">
      <div className="sim-score-ring__value" style={{ color }}>
        {safe}
      </div>
      <div className="sim-score-ring__label">{label}</div>
    </div>
  );
}

function EmptyAgentsState() {
  return (
    <div className="sim-empty-panel">
      <div className="sim-empty-panel__icon">
        <Users size={24} />
      </div>
      <div className="sim-empty-panel__title">尚未选择目标人群</div>
      <p>至少选择一个 agent 模板或添加手写 persona 后才能运行模拟。</p>
    </div>
  );
}

function ListSection({
  title,
  icon: Icon,
  items,
  variant = 'neutral',
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  variant?: 'success' | 'warning' | 'neutral' | 'info';
}) {
  if (items.length === 0) return null;
  const variantClass = `sim-list-section--${variant}`;
  return (
    <div className={`sim-list-section ${variantClass}`}>
      <div className="sim-list-section__header">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <ul className="sim-list-section__items">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function SimulatedMarketWorkbench({ initialPrefill, goToFlywheel }: { initialPrefill?: SimulatedMarketPrefill | null; goToFlywheel?: (decisionId: string) => void }) {
  const [activeTab, setActiveTab] = useState<ViewTab>('config');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TargetUserAgent[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<SimulationRun | null>(null);
  const [running, setRunning] = useState(false);

  const [sourceType, setSourceType] = useState<SimulatedMarketInput['sourceType']>('manual_strategy');
  const [sourceRefId, setSourceRefId] = useState('');
  const [strategyText, setStrategyText] = useState(DEFAULT_STRATEGY_TEXT);

  const [channelEntityId, setChannelEntityId] = useState('');
  const [marketingEventId, setMarketingEventId] = useState('');
  const [businessScenarioId, setBusinessScenarioId] = useState('');
  const [contextText, setContextText] = useState('');

  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [manualPersonas, setManualPersonas] = useState<TargetUserAgent[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualPreferences, setManualPreferences] = useState('');
  const [manualConcerns, setManualConcerns] = useState('');

  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionSkuId, setDecisionSkuId] = useState('');
  const [decisionChannelId, setDecisionChannelId] = useState('');
  const [decisionRecommendation, setDecisionRecommendation] = useState<'priority_launch' | 'test_launch' | 'observe' | 'avoid'>('test_launch');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [creatingDecision, setCreatingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [channelObjects, setChannelObjects] = useState<ChannelObject[]>([]);
  const [channelObjectsLoading, setChannelObjectsLoading] = useState(false);

  const channelEntityOptions = useMemo(
    () => (channelObjects ?? []).filter((o) => o.targetObject === 'ChannelEntity'),
    [channelObjects]
  );
  const marketingEventOptions = useMemo(
    () => (channelObjects ?? []).filter((o) => o.objectType === 'marketing_event'),
    [channelObjects]
  );
  const businessScenarioOptions = useMemo(
    () => (channelObjects ?? []).filter((o) => o.objectType === 'business_scenario'),
    [channelObjects]
  );

  const selectedAgents = useMemo(() => {
    const fromTemplates = templates.filter((t) => selectedAgentIds.has(t.agentId));
    return [...fromTemplates, ...manualPersonas];
  }, [templates, selectedAgentIds, manualPersonas]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [templatesRes, runsRes] = await Promise.all([
          api.getSimulatedMarketAgentTemplates(),
          api.getSimulatedMarketRuns(),
        ]);
        if (!cancelled) {
          setTemplates(templatesRes.data.agents);
          setRuns(runsRes.data.items);
          if (templatesRes.data.agents.length > 0) {
            setSelectedAgentIds(new Set(templatesRes.data.agents.map((a) => a.agentId)));
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('加载模拟市场数据失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadChannelObjects = async () => {
      setChannelObjectsLoading(true);
      try {
        const res = await api.getChannelObjects({ pageSize: 100 });
        if (!cancelled) setChannelObjects(res.data.items);
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setChannelObjectsLoading(false);
      }
    };
    loadChannelObjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialPrefill) return;
    setSourceType(initialPrefill.sourceType);
    if (initialPrefill.sourceRef?.id) setSourceRefId(initialPrefill.sourceRef.id);
    if (initialPrefill.strategyText) setStrategyText(initialPrefill.strategyText);
    if (initialPrefill.marketContext?.channelEntityId) setChannelEntityId(initialPrefill.marketContext.channelEntityId);
    if (initialPrefill.marketContext?.marketingEventId) setMarketingEventId(initialPrefill.marketContext.marketingEventId);
    if (initialPrefill.marketContext?.businessScenarioId) setBusinessScenarioId(initialPrefill.marketContext.businessScenarioId);
    if (initialPrefill.marketContext?.contextText) setContextText(initialPrefill.marketContext.contextText);
    setActiveTab('config');
  }, [initialPrefill]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const addManualPersona = () => {
    if (!manualName.trim()) return;
    const agent: TargetUserAgent = {
      agentId: `manual-persona-${Date.now()}`,
      name: manualName.trim(),
      sourceType: 'manual_persona',
      profile: {
        preferences: manualPreferences.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        concerns: manualConcerns.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      },
      weight: 1,
    };
    setManualPersonas((prev) => [...prev, agent]);
    setManualName('');
    setManualPreferences('');
    setManualConcerns('');
  };

  const removeManualPersona = (agentId: string) => {
    setManualPersonas((prev) => prev.filter((a) => a.agentId !== agentId));
  };

  const runSimulation = async () => {
    if (selectedAgents.length === 0) {
      setError('至少选择一个目标人群 agent');
      return;
    }
    if (!strategyText.trim()) {
      setError('请填写策略文本');
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const input: SimulatedMarketInput = {
        sourceType,
        strategyText: strategyText.trim(),
        marketContext: {
          channelEntityId: channelEntityId.trim() || undefined,
          marketingEventId: marketingEventId.trim() || undefined,
          businessScenarioId: businessScenarioId.trim() || undefined,
          contextText: contextText.trim() || undefined,
        },
        targetAgentSet: selectedAgents,
      };
      if (sourceType !== 'manual_strategy' && sourceRefId.trim()) {
        input.sourceRef = { id: sourceRefId.trim(), type: sourceType };
      }
      const res = await api.createSimulatedMarketRun(input);
      setSelectedRun(res.data);
      setRuns((prev) => [res.data, ...prev]);
      setActiveTab('config');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '运行模拟失败');
    } finally {
      setRunning(false);
    }
  };

  const loadRun = async (runId: string) => {
    try {
      const res = await api.getSimulatedMarketRun(runId);
      setSelectedRun(res.data);
      setActiveTab('config');
    } catch (err) {
      console.error(err);
      setError('加载模拟记录失败');
    }
  };

  const handleReset = () => {
    setSelectedRun(null);
    setError(null);
    setStrategyText(DEFAULT_STRATEGY_TEXT);
    setSourceType('manual_strategy');
    setSourceRefId('');
    setChannelEntityId('');
    setMarketingEventId('');
    setBusinessScenarioId('');
    setContextText('');
    setManualPersonas([]);
    setSelectedAgentIds(new Set(templates.map((a) => a.agentId)));
    setShowDecisionForm(false);
    setDecisionError(null);
  };

  const deriveDecisionDefaults = (run: SimulationRun) => {
    const input = run.inputSnapshot;
    let skuId = '';
    if (input.sourceType === 'single_product_portrait' && input.sourceRef?.id) {
      skuId = input.sourceRef.id;
    } else if (input.sourceType === 'product_channel_match' && input.sourceRef?.id) {
      const match = input.strategyText.match(/^SKU:\s*(.+)$/m);
      skuId = match ? match[1].trim() : '';
    }
    const channelId = input.marketContext?.channelEntityId ?? channelEntityId ?? '';
    const overall = run.result?.overall;
    let recommendation: 'priority_launch' | 'test_launch' | 'observe' | 'avoid' = 'test_launch';
    if (overall) {
      if (overall.acceptanceScore >= 70) recommendation = 'priority_launch';
      else if (overall.acceptanceScore >= 50) recommendation = 'test_launch';
      else if (overall.acceptanceScore >= 35) recommendation = 'observe';
      else recommendation = 'avoid';
    }
    const rationale = overall
      ? `基于模拟市场结果（runId: ${run.runId}），整体接受度 ${overall.acceptanceScore}，购买意向 ${overall.purchaseIntentScore}，置信度 ${(overall.confidence * 100).toFixed(0)}%。${overall.riskSummary.length ? '主要风险：' + overall.riskSummary.join('；') + '。' : ''}`
      : `基于模拟市场结果（runId: ${run.runId}）创建经营决策。`;
    return { skuId, channelId, recommendation, rationale };
  };

  const openDecisionForm = () => {
    if (!selectedRun || !selectedRun.result) return;
    const defaults = deriveDecisionDefaults(selectedRun);
    setDecisionSkuId(defaults.skuId);
    setDecisionChannelId(defaults.channelId);
    setDecisionRecommendation(defaults.recommendation);
    setDecisionRationale(defaults.rationale);
    setDecisionError(null);
    setShowDecisionForm(true);
  };

  const createDecision = async () => {
    if (!selectedRun) return;
    if (!decisionSkuId.trim() || !decisionChannelId.trim()) {
      setDecisionError('SKU 与渠道对象 ID 为必填字段');
      return;
    }
    setCreatingDecision(true);
    setDecisionError(null);
    try {
      const res = await api.createDecision({
        skuId: decisionSkuId.trim(),
        channelId: decisionChannelId.trim(),
        recommendation: decisionRecommendation,
        rationale: decisionRationale.trim(),
        simulationRunId: selectedRun.runId,
        sourceType: selectedRun.inputSnapshot.sourceType,
        sourceRef: selectedRun.inputSnapshot.sourceRef,
        simulationSummary: selectedRun.result?.overall,
        owner: '运营专员',
      });
      if (goToFlywheel) {
        goToFlywheel(res.data.decisionId);
      } else {
        setShowDecisionForm(false);
      }
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : '创建经营决策失败');
    } finally {
      setCreatingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="sim-workbench">
        <div className="empty-state" style={{ minHeight: 300 }}>
          <div className="empty-state__title">加载模拟市场数据...</div>
        </div>
      </div>
    );
  }

  if (error && !selectedRun && runs.length === 0) {
    return (
      <div className="sim-workbench">
        <div className="alert-banner alert-banner--warning">
          <AlertTriangle size={16} />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="sim-workbench">
      <div className="sim-workbench__header">
        <div className="sim-workbench__title">
          <Beaker size={18} />
          <span>模拟市场工作台</span>
        </div>
        <div className="sim-workbench__tabs">
          <button
            className={`sim-workbench__tab${activeTab === 'config' ? ' sim-workbench__tab--active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <Sparkles size={14} />
            运行配置
          </button>
          <button
            className={`sim-workbench__tab${activeTab === 'history' ? ' sim-workbench__tab--active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={14} />
            历史记录
            <span className="sim-workbench__tab-count">{runs.length}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-banner--warning">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {activeTab === 'history' ? (
        <div className="sim-history">
          <div className="sim-history__header">
            <h3 className="sim-history__title">历史模拟记录</h3>
            <button className="btn" onClick={() => setActiveTab('config')}>
              返回配置
            </button>
          </div>
          {runs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📋</div>
              <div className="empty-state__title">暂无模拟记录</div>
              <p>完成一次模拟后，结果会出现在这里。</p>
            </div>
          ) : (
            <div className="sim-history__list">
              {runs.map((run) => (
                <button
                  key={run.runId}
                  className="sim-history__item"
                  onClick={() => loadRun(run.runId)}
                >
                  <div className="sim-history__item-main">
                    <span className="sim-history__item-id">{run.runId}</span>
                    <span className={getStatusBadgeClass(run.status)}>{run.status}</span>
                  </div>
                  <div className="sim-history__item-meta">
                    <span>{formatDate(run.generatedAt)}</span>
                    <span>agent: {run.inputSnapshot.targetAgentSet.length}</span>
                    <span>provider: {run.provider}</span>
                  </div>
                  <ChevronRight size={16} className="sim-history__item-arrow" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="sim-workbench__body">
          {/* Left: Configuration */}
          <div className="sim-workbench__config">
            {/* Strategy Input */}
            <section className="sim-panel">
              <div className="sim-panel__header">
                <FileText size={16} />
                <h3>策略输入</h3>
              </div>
              <div className="sim-panel__body">
                <div className="sim-form-row">
                  <label className="sim-form-label">策略来源</label>
                  <select
                    className="form-control"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as SimulatedMarketInput['sourceType'])}
                  >
                    {SOURCE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {sourceType !== 'manual_strategy' && (
                  <div className="sim-form-row">
                    <label className="sim-form-label">来源引用 ID</label>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="例如 pred_20260701_0001"
                      value={sourceRefId}
                      onChange={(e) => setSourceRefId(e.target.value)}
                    />
                  </div>
                )}
                <div className="sim-form-row">
                  <label className="sim-form-label">策略文本</label>
                  <textarea
                    className="form-control sim-textarea"
                    rows={5}
                    value={strategyText}
                    onChange={(e) => setStrategyText(e.target.value)}
                    placeholder="粘贴商品、渠道、活动、价格、卖点、分货或投放建议等策略文本"
                  />
                </div>
              </div>
            </section>

            {/* Target Users */}
            <section className="sim-panel">
              <div className="sim-panel__header">
                <Target size={16} />
                <h3>目标用户 Agent</h3>
                <span className="sim-panel__sub">
                  {selectedAgents.length} 个已选
                </span>
              </div>
              <div className="sim-panel__body">
                <div className="sim-agent-grid">
                  {templates.map((agent) => (
                    <label
                      key={agent.agentId}
                      className={`sim-agent-card${selectedAgentIds.has(agent.agentId) ? ' sim-agent-card--selected' : ''} ${getAgentColorClass(agent.name)}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.has(agent.agentId)}
                        onChange={() => toggleAgent(agent.agentId)}
                      />
                      <div className="sim-agent-card__avatar">{getAgentInitial(agent.name)}</div>
                      <div className="sim-agent-card__body">
                        <div className="sim-agent-card__name">{agent.name}</div>
                        <div className="sim-agent-card__tags">
                          {(agent.profile.preferences ?? []).slice(0, 3).map((p, i) => (
                            <span key={i} className="sim-tag">{p}</span>
                          ))}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="sim-manual-persona">
                  <div className="sim-manual-persona__title">临时手写 persona</div>
                  <div className="sim-manual-persona__form">
                    <input
                      className="form-control"
                      placeholder=" persona 名称"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                    />
                    <input
                      className="form-control"
                      placeholder="偏好（用逗号分隔）"
                      value={manualPreferences}
                      onChange={(e) => setManualPreferences(e.target.value)}
                    />
                    <input
                      className="form-control"
                      placeholder="顾虑（用逗号分隔）"
                      value={manualConcerns}
                      onChange={(e) => setManualConcerns(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={addManualPersona}>
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                  {manualPersonas.length > 0 && (
                    <div className="sim-manual-persona__list">
                      {manualPersonas.map((agent) => (
                        <div key={agent.agentId} className="sim-manual-persona__chip">
                          <span>{agent.name}</span>
                          <button
                            aria-label="移除"
                            onClick={() => removeManualPersona(agent.agentId)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedAgents.length === 0 && <EmptyAgentsState />}
              </div>
            </section>

            {/* Market Scenario */}
            <section className="sim-panel">
              <div className="sim-panel__header">
                <Info size={16} />
                <h3>市场场景</h3>
                {channelObjectsLoading && <Loader2 size={14} className="sim-spin" />}
              </div>
              <div className="sim-panel__body">
                <div className="sim-form-grid">
                  <div className="sim-form-row">
                    <label className="sim-form-label">{MARKET_CONTEXT_LABELS.channelEntityId}</label>
                    <MarketContextSelector
                      field="channelEntityId"
                      value={channelEntityId}
                      options={channelEntityOptions}
                      onChange={setChannelEntityId}
                      placeholder={REAL_CHANNEL_OBJECT_EXAMPLES.channelEntityId}
                    />
                  </div>
                  <div className="sim-form-row">
                    <label className="sim-form-label">{MARKET_CONTEXT_LABELS.marketingEventId}</label>
                    <MarketContextSelector
                      field="marketingEventId"
                      value={marketingEventId}
                      options={marketingEventOptions}
                      onChange={setMarketingEventId}
                      placeholder={REAL_CHANNEL_OBJECT_EXAMPLES.marketingEventId}
                    />
                  </div>
                  <div className="sim-form-row">
                    <label className="sim-form-label">{MARKET_CONTEXT_LABELS.businessScenarioId}</label>
                    <MarketContextSelector
                      field="businessScenarioId"
                      value={businessScenarioId}
                      options={businessScenarioOptions}
                      onChange={setBusinessScenarioId}
                      placeholder={REAL_CHANNEL_OBJECT_EXAMPLES.businessScenarioId}
                    />
                  </div>
                </div>
                <div className="sim-form-row">
                  <label className="sim-form-label">{MARKET_CONTEXT_LABELS.contextText}</label>
                  <textarea
                    className="form-control sim-textarea"
                    rows={2}
                    value={contextText}
                    onChange={(e) => setContextText(e.target.value)}
                    placeholder="描述本次模拟的渠道、活动、预算或库存约束等业务重点"
                  />
                </div>
                <div className="sim-market-context-hint">
                  <Info size={12} />
                  <span>从下拉框选择真实对象时，ID 会同步填入；手动填写/未选择时，ID 不做存在性校验。</span>
                </div>
              </div>
            </section>

            <div className="sim-actions">
              <button
                className="btn btn-primary sim-run-btn"
                onClick={runSimulation}
                disabled={running || selectedAgents.length === 0}
              >
                {running ? <Loader2 size={16} className="sim-spin" /> : <Sparkles size={16} />}
                运行模拟
              </button>
              <button className="btn" onClick={handleReset}>
                <RefreshCw size={16} />
                重置
              </button>
            </div>
          </div>

          {/* Right: Results */}
          <div className="sim-workbench__result">
            {!selectedRun ? (
              <div className="sim-empty-result">
                <div className="empty-state">
                  <div className="empty-state__icon">📊</div>
                  <div className="empty-state__title">策略压力测试报告</div>
                  <p>配置左侧参数并运行模拟后，这里将生成结构化报告。</p>
                  <div className="sim-empty-result__hint">
                    <Info size={14} />
                    <span>模拟结果属于 Derived Result，不承诺真实销量，仅用于投放前压力测试。</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="sim-report">
                <div className="sim-report__header">
                  <div className="sim-report__title">
                    <FileText size={18} />
                    <span>策略压力测试报告</span>
                  </div>
                  <div className="sim-report__meta">
                    <span className={getStatusBadgeClass(selectedRun.status)}>{selectedRun.status}</span>
                    <span className="sim-report__meta-item">{formatDate(selectedRun.generatedAt)}</span>
                    <span className="sim-report__meta-item">{selectedRun.runId}</span>
                  </div>
                </div>

                {selectedRun.status === 'succeeded' && selectedRun.result && (
                  <div className="sim-report__decision">
                    {!showDecisionForm ? (
                      <div className="sim-report__decision-bar">
                        <div className="sim-report__decision-hint">
                          <Info size={14} />
                          <span>模拟结果属于 Derived Result，创建决策前请确认必填字段。</span>
                        </div>
                        <button className="btn btn-primary" onClick={openDecisionForm}>
                          创建经营决策
                        </button>
                      </div>
                    ) : (
                      <div className="sim-decision-form">
                        <div className="sim-decision-form__title">创建经营决策</div>
                        {decisionError && (
                          <div className="alert-banner alert-banner--danger">{decisionError}</div>
                        )}
                        <div className="sim-decision-form__grid">
                          <div className="sim-form-row">
                            <label className="sim-form-label">SKU ID</label>
                            <input
                              className="form-control"
                              type="text"
                              value={decisionSkuId}
                              onChange={(e) => setDecisionSkuId(e.target.value)}
                              placeholder="必填"
                            />
                          </div>
                          <div className="sim-form-row">
                            <label className="sim-form-label">渠道对象 ID</label>
                            <input
                              className="form-control"
                              type="text"
                              value={decisionChannelId}
                              onChange={(e) => setDecisionChannelId(e.target.value)}
                              placeholder="必填"
                            />
                          </div>
                          <div className="sim-form-row">
                            <label className="sim-form-label">决策建议</label>
                            <select
                              className="form-control"
                              value={decisionRecommendation}
                              onChange={(e) => setDecisionRecommendation(e.target.value as 'priority_launch' | 'test_launch' | 'observe' | 'avoid')}
                            >
                              <option value="priority_launch">重点铺货 / 强投流</option>
                              <option value="test_launch">小批次铺货 / 测试</option>
                              <option value="observe">暂缓分货 / 观察</option>
                              <option value="avoid">熔断拦截 / 避免</option>
                            </select>
                          </div>
                        </div>
                        <div className="sim-form-row">
                          <label className="sim-form-label">决策依据</label>
                          <textarea
                            className="form-control sim-textarea"
                            rows={3}
                            value={decisionRationale}
                            onChange={(e) => setDecisionRationale(e.target.value)}
                          />
                        </div>
                        <div className="sim-actions">
                          <button
                            className="btn btn-primary"
                            onClick={createDecision}
                            disabled={creatingDecision}
                          >
                            {creatingDecision ? <Loader2 size={16} className="sim-spin" /> : null}
                            确认创建
                          </button>
                          <button className="btn" onClick={() => setShowDecisionForm(false)} disabled={creatingDecision}>
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <FallbackWarning run={selectedRun} />

                <div className="sim-report__quality">
                  <div className="sim-report__quality-label">
                    <Info size={14} />
                    provider / model
                  </div>
                  <div className="sim-report__quality-value">
                    {selectedRun.provider} / {selectedRun.modelVersion}
                  </div>
                  <ProviderBadge run={selectedRun} />
                  {selectedRun.qualityFlags.length > 0 && (
                    <div className="sim-report__quality-flags">
                      {selectedRun.qualityFlags.map((flag, idx) => (
                        <span key={idx} className="sim-tag sim-tag--warning">{flag}</span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRun.result ? (
                  <>
                    <div className="sim-report__scores">
                      <ScoreRing value={selectedRun.result.overall.acceptanceScore} label="整体接受度" />
                      <ScoreRing value={selectedRun.result.overall.purchaseIntentScore} label="购买/互动意向" />
                      <div className="sim-confidence-card">
                        <div className="sim-confidence-card__label">置信度</div>
                        <div className="sim-confidence-card__bar-bg">
                          <div
                            className="sim-confidence-card__bar-fill"
                            style={{ width: `${Math.round(selectedRun.result.overall.confidence * 100)}%` }}
                          />
                        </div>
                        <div className="sim-confidence-card__value">
                          {(selectedRun.result.overall.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div className="sim-report__summaries">
                      <ListSection
                        title="机会点"
                        icon={CheckCircle2}
                        items={selectedRun.result.overall.opportunitySummary}
                        variant="success"
                      />
                      <ListSection
                        title="风险点"
                        icon={XCircle}
                        items={selectedRun.result.overall.riskSummary}
                        variant="warning"
                      />
                      <ListSection
                        title="建议调整"
                        icon={Lightbulb}
                        items={selectedRun.result.overall.recommendedAdjustments}
                        variant="info"
                      />
                    </div>

                    <div className="sim-report__feedback">
                      <div className="sim-report__feedback-header">
                        <Users size={16} />
                        <h4>分 Agent 反馈</h4>
                      </div>
                      <div className="sim-feedback-grid">
                        {selectedRun.result.agentFeedback.map((feedback) => (
                          <AgentFeedbackCard key={feedback.agentId} feedback={feedback} />
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state__title">暂无结果数据</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentFeedbackCard({ feedback }: { feedback: SimulatedMarketAgentFeedback }) {
  return (
    <div className={`sim-feedback-card ${getAgentColorClass(feedback.agentId)}`}>
      <div className="sim-feedback-card__header">
        <div className="sim-feedback-card__agent">{feedback.agentId}</div>
        <div className="sim-feedback-card__scores">
          <span>接受 {feedback.acceptanceScore}</span>
          <span>意向 {feedback.purchaseIntentScore}</span>
        </div>
      </div>
      <div className="sim-feedback-card__quote">{feedback.quoteSummary}</div>
      <div className="sim-feedback-card__section">
        <div className="sim-feedback-card__section-title">正向驱动</div>
        <ul>
          {feedback.positiveDrivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
      <div className="sim-feedback-card__section">
        <div className="sim-feedback-card__section-title">核心顾虑</div>
        <ul>
          {feedback.objections.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
      <div className="sim-feedback-card__suggestion">
        <ArrowRight size={14} />
        <span>{feedback.suggestedAdjustment}</span>
      </div>
    </div>
  );
}
