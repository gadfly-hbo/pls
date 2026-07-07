import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { ChannelObject, AudienceProfile, ProductFitProfile, ChannelObjectBinding, MatchResult, AccountProfile, AccountMatchResult } from '../types';
import { translateTag } from '../utils/translate';
import {
  Search,
  Import,
  BarChart3,
  AlertTriangle,
  HelpCircle,
  X,
  Layers
} from 'lucide-react';

const OBJECT_TYPE_LABELS: Record<string, string> = {
  platform: '平台',
  trade_area: '商圈',
  store: '店铺',
  account: '账号',
  marketing_event: '活动',
  business_scenario: '场景',
};

const OBJECT_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'platform', label: '平台' },
  { value: 'trade_area', label: '商圈' },
  { value: 'store', label: '店铺' },
  { value: 'account', label: '账号' },
  { value: 'marketing_event', label: '活动' },
  { value: 'business_scenario', label: '场景' },
];

const PLATFORM_TYPE_OPTIONS = [
  { value: '', label: '全部平台' },
  { value: 'content_ecommerce', label: '内容电商' },
  { value: 'traditional_ecommerce', label: '传统电商' },
  { value: 'social_ecommerce', label: '社交电商' },
];

function translateObjectType(type: string): string {
  return OBJECT_TYPE_LABELS[type] || type;
}

function translatePlatformType(type: string | null | undefined): string {
  switch (type) {
    case 'content_ecommerce': return '内容电商';
    case 'traditional_ecommerce': return '传统电商';
    case 'social_ecommerce': return '社交电商';
    default: return type || '-';
  }
}

function qualityFlagClass(flag: string): string {
  if (flag.includes('manual') || flag.includes('generated_key')) return 'status-badge--warning';
  if (flag.includes('duplicate')) return 'status-badge--danger';
  if (flag.includes('missing')) return 'status-badge--warning';
  return 'status-badge--neutral';
}

function translateQualityFlag(flag: string): string {
  const map: Record<string, string> = {
    manual_entity_without_profile: '手动创建无画像',
    generated_key_needs_review: '生成 key 待复核',
    possible_duplicate: '疑似重复',
    missing_product_fit_profile: '缺少商品适配',
    radius_above_recommended_max: '半径超出建议值',
    missing_parent_reference: '父对象引用缺失',
  };
  return map[flag] || flag;
}

function formatSampleSize(value: number | null): string {
  if (value === null || value === undefined) return '无统计样本';
  return value.toLocaleString();
}

function formatTimeWindow(value: string | null): string {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function useChannelObjects() {
  const [objects, setObjects] = useState<ChannelObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getChannelObjects({ pageSize: 100 });
      setObjects(res.data.items);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  return { objects, loading, error, refetch: fetch };
}

export default function ChannelObjectLibrary() {
  const { objects, loading, error, refetch } = useChannelObjects();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState('');
  const [platformTypeFilter, setPlatformTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'audience' | 'productFit' | 'match' | 'bindings' | 'edit'>('overview');
  const [editLoading, setEditLoading] = useState(false);
  const [detail, setDetail] = useState<ChannelObject | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [audienceProfiles, setAudienceProfiles] = useState<AudienceProfile[]>([]);
  const [productFitProfiles, setProductFitProfiles] = useState<ProductFitProfile[]>([]);
  const [bindings, setBindings] = useState<ChannelObjectBinding[]>([]);
  const [channelEntityProfile, setChannelEntityProfile] = useState<AccountProfile | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'basic' | 'advanced'>('basic');
  const [importObjectType, setImportObjectType] = useState('');
  const [importPackageTarget, setImportPackageTarget] = useState('channel-profile-object-library');
  const [importDryRunResult, setImportDryRunResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importConfirmText, setImportConfirmText] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisParams, setAnalysisParams] = useState({
    channelEntityIds: [] as string[],
    marketingEventId: '',
    businessScenarioId: '',
    skuIds: ['mock_sku_101'],
  });
  const [analysisResults, setAnalysisResults] = useState<MatchResult[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ChannelObject>>({});
  const [matchAnalysisSkuId, setMatchAnalysisSkuId] = useState('mock_sku_101');
  const [matchAnalysisResult, setMatchAnalysisResult] = useState<AccountMatchResult | null>(null);
  const [matchAnalysisLoading, setMatchAnalysisLoading] = useState(false);
  const [matchAnalysisError, setMatchAnalysisError] = useState<string | null>(null);

  const filteredObjects = useMemo(() => {
    return objects.filter((obj) => {
      const matchesSearch =
        obj.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.canonicalObjectKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.sourceStableKey.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !objectTypeFilter || obj.objectType === objectTypeFilter;
      const matchesPlatform = !platformTypeFilter || obj.platformType === platformTypeFilter;
      return matchesSearch && matchesType && matchesPlatform;
    });
  }, [objects, searchQuery, objectTypeFilter, platformTypeFilter]);

  const groupedObjects = useMemo(() => {
    const groups: Record<string, ChannelObject[]> = {};
    filteredObjects.forEach((obj) => {
      const type = obj.objectType;
      if (!groups[type]) groups[type] = [];
      groups[type].push(obj);
    });
    return groups;
  }, [filteredObjects]);

  useEffect(() => {
    if (!selectedKey) return;
    setDetailLoading(true);
    api.getChannelObject(selectedKey)
      .then((res) => {
        setDetail(res.data);
        setEditForm(res.data);
      })
      .catch((err) => console.error(err))
      .finally(() => setDetailLoading(false));

    api.getChannelObjectAudienceProfiles(selectedKey)
      .then((res) => setAudienceProfiles(res.data.items))
      .catch(() => setAudienceProfiles([]));

    api.getChannelObjectProductFitProfiles(selectedKey)
      .then((res) => setProductFitProfiles(res.data.items))
      .catch(() => setProductFitProfiles([]));

    api.getChannelObjectBindings(selectedKey)
      .then((res) => setBindings(res.data.items))
      .catch(() => setBindings([]));

    api.getChannelEntityProfile(selectedKey)
      .then((res) => setChannelEntityProfile(res.data))
      .catch(() => setChannelEntityProfile(null));
  }, [selectedKey]);

  useEffect(() => {
    if (objects.length > 0 && !selectedKey) {
      setSelectedKey(objects[0].canonicalObjectKey);
    }
  }, [objects, selectedKey]);

  const handleEditSave = async () => {
    if (!selectedKey) return;
    setEditLoading(true);
    try {
      const res = await api.updateChannelObject(selectedKey, editForm);
      setDetail(res.data);
      await refetch();
      setActiveTab('overview');
    } catch (err: any) {
      alert('保存失败: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleImportDryRun = async () => {
    const target = importPackageTarget.trim();
    if (!target) return;
    setImportLoading(true);
    try {
      const res = await api.dryRunDbOperation('IMPORT', target);
      setImportDryRunResult(res.data);
    } catch (err: any) {
      alert('Dry-run 失败: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    const target = importPackageTarget.trim();
    if (!importConfirmText || !target) return;
    setImportLoading(true);
    try {
      await api.executeDbOperation('IMPORT', target, importConfirmText);
      setShowImportModal(false);
      setImportDryRunResult(null);
      setImportConfirmText('');
      refetch();
    } catch (err: any) {
      alert('导入失败: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalysisLoading(true);
    try {
      const res = await api.analyzeChannelObjects({
        channelEntityIds: analysisParams.channelEntityIds,
        marketingEventId: analysisParams.marketingEventId || undefined,
        businessScenarioId: analysisParams.businessScenarioId || undefined,
        skuIds: analysisParams.skuIds,
      });
      setAnalysisResults(res.data.matchResults);
    } catch (err: any) {
      alert('分析失败: ' + err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleMatchAnalysis = async () => {
    if (!selectedKey || !matchAnalysisSkuId) return;
    setMatchAnalysisLoading(true);
    setMatchAnalysisError(null);
    setMatchAnalysisResult(null);
    try {
      const accountChannelId = channelEntityProfile?.sourceEntityKey || selectedKey;
      const res = await api.getAccountMatch(matchAnalysisSkuId, accountChannelId);
      setMatchAnalysisResult(res.data);
    } catch {
      setMatchAnalysisError('待接入真实分析接口：当前渠道对象匹配分析能力尚未就绪。');
    } finally {
      setMatchAnalysisLoading(false);
    }
  };

  const toggleChannelEntity = (key: string) => {
    setAnalysisParams((prev) => ({
      ...prev,
      channelEntityIds: prev.channelEntityIds.includes(key)
        ? prev.channelEntityIds.filter((k) => k !== key)
        : [...prev.channelEntityIds, key],
    }));
  };

  const renderObjectList = () => (
    <div className="workbench-sidebar">
      <div className="workbench-sidebar__header">
        <h2 className="workbench-sidebar__title">渠道画像</h2>
        <div className="toolbar" style={{ padding: 0, border: 'none' }}>
          <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
            <Import size={14} /> 导入
          </button>
          <button className="btn" onClick={() => setShowAnalysis(true)}>
            <BarChart3 size={14} /> 分析
          </button>
        </div>
      </div>
      <div className="workbench-sidebar__search">
        <div className="form-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 120 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: 32 }}
              placeholder="搜索对象..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 110 }}
            value={objectTypeFilter}
            onChange={(e) => setObjectTypeFilter(e.target.value)}
          >
            {OBJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ width: 120 }}
            value={platformTypeFilter}
            onChange={(e) => setPlatformTypeFilter(e.target.value)}
          >
            {PLATFORM_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="workbench-sidebar__list">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state__title">加载中...</div>
          </div>
        ) : filteredObjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <div className="empty-state__title">暂无匹配对象</div>
          </div>
        ) : (
          Object.entries(groupedObjects).map(([type, groupItems]) => (
            <div key={type} className="workbench-sidebar__group">
              <div className="workbench-sidebar__group-label">
                <Layers size={12} /> {translateObjectType(type)}
              </div>
              <div className="workbench-sidebar__group-items">
                {groupItems.map((obj) => (
                  <div
                    key={obj.canonicalObjectKey}
                    className={`entity-list-item${selectedKey === obj.canonicalObjectKey ? ' entity-list-item--selected' : ''}`}
                    onClick={() => { setSelectedKey(obj.canonicalObjectKey); setActiveTab('overview'); }}
                  >
                    <div className="entity-list-item__name">{obj.displayName}</div>
                    <div className="entity-list-item__id">{obj.canonicalObjectKey}</div>
                    <div className="entity-list-item__footer">
                      <span>{obj.dataVersion}</span>
                      {obj.qualityFlags.length > 0 && (
                        <span className={`status-badge ${qualityFlagClass(obj.qualityFlags[0])}`}>
                          {translateQualityFlag(obj.qualityFlags[0])}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderQualityFlags = (flags: string[]) => {
    if (!flags || flags.length === 0) return null;
    return (
      <div className="alert-banner alert-banner--warning" style={{ marginBottom: 16 }}>
        <AlertTriangle size={16} />
        <span>质量标记：</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {flags.map((flag) => (
            <span key={flag} className={`status-badge ${qualityFlagClass(flag)}`}>
              {translateQualityFlag(flag)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderDetailHeader = () => {
    if (!detail) return null;
    return (
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">{detail.displayName}</h2>
          <div className="page-header__meta">
            <span className="tag" style={{ margin: 0 }}>{translateObjectType(detail.objectType)}</span>
            <span className="status-badge status-badge--neutral">ID: {detail.canonicalObjectKey}</span>
            <span className="status-badge status-badge--neutral">版本: {detail.dataVersion}</span>
            <span className="status-badge status-badge--neutral">来源: {detail.sourceBatchId}</span>
          </div>
        </div>
        <div className="page-header__actions">
          <div className="segmented-control">
            {[
              { id: 'overview', label: '总览' },
              { id: 'audience', label: '人群画像' },
              { id: 'productFit', label: '商品适配' },
              { id: 'match', label: '匹配分析' },
              { id: 'bindings', label: '绑定关系' },
              { id: 'edit', label: '编辑' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`segmented-control__btn${activeTab === tab.id ? ' segmented-control__btn--active' : ''}`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    if (!detail) return null;
    return (
      <div className="workbench-detail">
        {renderQualityFlags(detail.qualityFlags)}
        <div className="metric-grid">
          <div className="metric-card metric-card--compact">
            <div className="metric-title">对象类型</div>
            <div className="metric-value">{translateObjectType(detail.objectType)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">平台类型</div>
            <div className="metric-value">{translatePlatformType(detail.platformType)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">数据来源</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{detail.source}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">生成时间</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{new Date(detail.generatedAt).toLocaleString()}</div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel__title">基础信息</h3>
          <div className="data-table-wrapper">
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ width: 140, color: 'var(--muted-foreground)' }}>canonicalObjectKey</td>
                  <td>{detail.canonicalObjectKey}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>objectVersionId</td>
                  <td>{detail.objectVersionId}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>sourceStableKey</td>
                  <td>{detail.sourceStableKey}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>keySource</td>
                  <td>{detail.keySource}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>entityStatus</td>
                  <td>{detail.entityStatus}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>timeWindow</td>
                  <td>{detail.timeWindow}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {detail.possibleDuplicate && (
          <div className="panel">
            <h3 className="panel__title">重复风险提示</h3>
            <div className="alert-banner alert-banner--warning">
              <AlertTriangle size={16} />
              <span>疑似重复对象，请人工复核</span>
            </div>
            {detail.duplicateCandidateKeys.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 6 }}>候选重复：</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.duplicateCandidateKeys.map((k) => (
                    <span key={k} className="tag" style={{ margin: 0 }}>{k}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>复核状态：{detail.manualReviewStatus}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAudienceProfile = () => {
    if (audienceProfiles.length === 0) {
      return (
        <div className="workbench-detail">
          <div className="empty-state" style={{ minHeight: 200 }}>
            <div className="empty-state__icon">👥</div>
            <div className="empty-state__title">暂无人群画像</div>
            <div>该对象未导入 AudienceProfile</div>
          </div>
        </div>
      );
    }
    const profile = audienceProfiles[0];
    const metrics = profile.performanceMetrics || channelEntityProfile?.performanceIndex;
    const benchmarkTags = profile.benchmarkTags || (channelEntityProfile?.coreTags as any);
    const interactionPreference = profile.interactionPreference || channelEntityProfile?.interactionPreference;

    return (
      <div className="workbench-detail">
        <div className="metric-grid">
          <div className="metric-card metric-card--compact">
            <div className="metric-title">样本量</div>
            <div className="metric-value">{formatSampleSize(profile.sampleSize)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">置信度</div>
            <div className="metric-value">{(profile.confidence * 100).toFixed(0)}%</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">时间窗口</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{formatTimeWindow(profile.timeWindow)}</div>
          </div>
          {metrics && (
            <>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">粉丝/关注量</div>
                <div className="metric-value">{(metrics.followerCount ?? 0).toLocaleString()}</div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">综合互动率</div>
                <div className="metric-value">{((metrics.engagementRate ?? 0) * 100).toFixed(2)}%</div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">成交转化率</div>
                <div className="metric-value">{((metrics.conversionRate ?? 0) * 100).toFixed(2)}%</div>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h3 className="panel__title">人群画像标签</h3>
          {profile.tags.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📊</div>
              <div className="empty-state__title">暂无核心画像数据</div>
              <div>可能是 Unmapped 或数据尚未导入</div>
            </div>
          ) : (
            <div className="tag-grid">
              {profile.tags.map((tag, idx) => (
                <div key={`${tag.tagId}-${idx}`} className="tag-grid__item">
                  <span className="tag-grid__label">{translateTag(tag.tagId)}</span>
                  <span className="tag-grid__score">{(tag.score * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {Array.isArray(benchmarkTags) && benchmarkTags.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">Benchmark 标签</h3>
            <div className="tag-grid">
              {benchmarkTags.map((tag, idx) => {
                const label = tag.dimension ? `${tag.dimension}: ${tag.optionLabel}` : String(tag.optionLabel ?? tag);
                const value = typeof tag.sharePercent === 'number' ? tag.sharePercent : (tag as any).score;
                return (
                  <div key={`${label}-${idx}`} className="tag-grid__item">
                    <span className="tag-grid__label">{label}</span>
                    <span className="tag-grid__score">{(Number(value) * (value > 1 ? 1 : 100)).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {Array.isArray(interactionPreference) && interactionPreference.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">触点与互动偏好</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {interactionPreference.map((pref) => (
                <span key={pref} className="tag" style={{ background: 'var(--background)', margin: 0 }}>{pref}</span>
              ))}
            </div>
          </div>
        )}

        {profile.qualityFlags.length > 0 && renderQualityFlags(profile.qualityFlags)}
      </div>
    );
  };

  const renderProductFitProfile = () => {
    if (productFitProfiles.length === 0) {
      return (
        <div className="workbench-detail">
          <div className="empty-state" style={{ minHeight: 200 }}>
            <div className="empty-state__icon">🛍️</div>
            <div className="empty-state__title">暂无商品适配画像</div>
            <div>该对象未导入 ProductFitProfile</div>
          </div>
        </div>
      );
    }
    const profile = productFitProfiles[0];
    return (
      <div className="workbench-detail">
        <div className="metric-grid">
          <div className="metric-card metric-card--compact">
            <div className="metric-title">置信度</div>
            <div className="metric-value">{(profile.confidence * 100).toFixed(0)}%</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">样本量</div>
            <div className="metric-value">{formatSampleSize(profile.sampleSize)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">来源</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{profile.source}</div>
          </div>
        </div>
        <div className="panel">
          <h3 className="panel__title">商品适配</h3>
          <div className="data-table-wrapper">
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ width: 120, color: 'var(--muted-foreground)' }}>适合品类</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.fitCategories.map((c) => <span key={c} className="tag" style={{ margin: 0 }}>{c}</span>)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>适合价格带</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.fitPriceBands.map((c) => <span key={c} className="tag" style={{ margin: 0 }}>{c}</span>)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>适合风格</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.fitStyles.map((c) => <span key={c} className="tag" style={{ margin: 0 }}>{c}</span>)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>适合场景</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.fitOccasions.map((c) => <span key={c} className="tag" style={{ margin: 0 }}>{c}</span>)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>适合上新类型</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {profile.fitLaunchTypes.map((c) => <span key={c} className="tag" style={{ margin: 0 }}>{c}</span>)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const handleMatchAnalysisExportCsv = () => {
    if (!matchAnalysisResult) return;
    const header = "skuId,accountId,fitScore,fitConfidence,qualityFlags,generatedAt,advice\n";
    const adviceStr = matchAnalysisResult.adjustmentAdvice.map(a => `${a.item}: ${a.suggestion}`).join('; ');
    const row = `${matchAnalysisResult.skuId},${matchAnalysisResult.accountId},${matchAnalysisResult.fitScore},${matchAnalysisResult.fitConfidence},"${matchAnalysisResult.qualityFlags.join('|')}",${new Date().toISOString()},"${adviceStr}"\n`;

    const blob = new Blob([header + row], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `channel_match_${matchAnalysisResult.skuId}_${matchAnalysisResult.accountId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMatchAnalysis = () => {
    if (!detail) return null;
    return (
      <div className="workbench-detail">
        <div className="toolbar">
          <div className="toolbar__label">选择匹配目标商品 (SKU):</div>
          <input
            className="form-control"
            style={{ width: 180, flex: '0 1 180px' }}
            value={matchAnalysisSkuId}
            onChange={(e) => setMatchAnalysisSkuId(e.target.value)}
            placeholder="输入 SKU ID"
          />
          <button className="btn btn-primary" onClick={handleMatchAnalysis} disabled={matchAnalysisLoading}>
            {matchAnalysisLoading ? '分析中...' : '分析匹配度'}
          </button>
          <div className="toolbar__spacer" />
          {matchAnalysisResult && (
            <button className="btn" onClick={handleMatchAnalysisExportCsv}>导出报告</button>
          )}
        </div>

        {matchAnalysisError && (
          <div className="alert-banner alert-banner--warning">
            {matchAnalysisError}
          </div>
        )}

        {matchAnalysisLoading && !matchAnalysisResult ? (
          <div className="empty-state">
            <div className="empty-state__title">分析计算中...</div>
          </div>
        ) : !matchAnalysisResult ? (
          <div className="empty-state" style={{ minHeight: 160 }}>
            <div className="empty-state__icon">📋</div>
            <div className="empty-state__title">输入商品ID并点击分析</div>
            <div>系统将计算号货匹配度并生成诊断报告</div>
          </div>
        ) : (
          <>
            <div className="metric-grid">
              <div className="metric-card" style={{ background: 'var(--background)' }}>
                <div className="metric-title">号货匹配综合得分</div>
                <div className="metric-value" style={{ color: 'var(--primary)' }}>
                  {(matchAnalysisResult.fitScore * 100).toFixed(0)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted-foreground)' }}>分</span>
                </div>
                <div className="metric-sub">
                  <span>算法置信度</span>
                  <span>{(matchAnalysisResult.fitConfidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <h3 className="panel__title">匹配维度对比</h3>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>匹配维度</th>
                      <th>当前实体特征</th>
                      <th>商品目标人群特征</th>
                      <th style={{ width: 90 }}>对齐状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchAnalysisResult.comparison.map((comp) => (
                      <tr key={comp.dimension}>
                        <td style={{ fontWeight: 500 }}>{comp.dimension}</td>
                        <td>{comp.accountTop1.label}</td>
                        <td>{comp.skuTop1.label}</td>
                        <td>
                          <span className={`status-badge ${comp.isAligned ? 'status-badge--success' : 'status-badge--danger'}`}>
                            {comp.isAligned ? '吻合' : '偏离'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h3 className="panel__title">策略调整与优化建议</h3>
              {matchAnalysisResult.adjustmentAdvice.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__icon">✅</div>
                  <div className="empty-state__title">当前匹配度极高，暂无优化建议。</div>
                </div>
              ) : (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>优化项目</th>
                        <th>行动建议</th>
                        <th style={{ width: 100 }}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchAnalysisResult.adjustmentAdvice.map((adv) => (
                        <tr key={adv.id}>
                          <td style={{ fontWeight: 500 }}>{adv.item}</td>
                          <td style={{ color: 'var(--muted-foreground)' }}>{adv.suggestion}</td>
                          <td>
                            <span className="status-badge status-badge--neutral">{adv.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderBindings = () => (
    <div className="workbench-detail">
      {bindings.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 200 }}>
          <div className="empty-state__icon">🔗</div>
          <div className="empty-state__title">暂无绑定关系</div>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>绑定类型</th>
                <th>源对象</th>
                <th>目标对象</th>
                <th>版本</th>
              </tr>
            </thead>
            <tbody>
              {bindings.map((b) => (
                <tr key={b.bindingId}>
                  <td>{b.bindingType}</td>
                  <td>{b.fromCanonicalObjectKey}</td>
                  <td>{b.toCanonicalObjectKey}</td>
                  <td>{b.dataVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderEdit = () => {
    if (!detail) return null;
    return (
      <div className="workbench-detail">
        <div className="panel">
          <h3 className="panel__title">轻量编辑</h3>
          <div className="form-group">
            <label>名称</label>
            <input
              data-testid="channel-object-edit-name"
              className="form-control"
              value={editForm.displayName || ''}
              onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
            />
          </div>
          {detail.objectType === 'trade_area' && (
            <div className="form-group">
              <label>商圈半径（公里）</label>
              <input
                type="number"
                className="form-control"
                value={String((editForm.entityAttributes?.radiusKm as number) || 3)}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    entityAttributes: { ...editForm.entityAttributes, radiusKm: Number(e.target.value) },
                  })
                }
              />
            </div>
          )}
          {detail.objectType === 'marketing_event' && (
            <div className="form-group">
              <label>活动二级标签（逗号分隔）</label>
              <input
                className="form-control"
                value={Array.isArray(editForm.entityAttributes?.customTags) ? (editForm.entityAttributes.customTags as string[]).join(',') : ''}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    entityAttributes: {
                      ...editForm.entityAttributes,
                      customTags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </div>
          )}
          {detail.objectType === 'business_scenario' && (
            <div className="form-group">
              <label>场景说明</label>
              <textarea
                className="form-control"
                rows={3}
                value={String(editForm.entityAttributes?.description || '')}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    entityAttributes: { ...editForm.entityAttributes, description: e.target.value },
                  })
                }
              />
            </div>
          )}
          <div className="form-group">
            <label>复核状态</label>
            <select
              className="form-control"
              value={editForm.manualReviewStatus || 'unreviewed'}
              onChange={(e) => setEditForm({ ...editForm, manualReviewStatus: e.target.value as ChannelObject['manualReviewStatus'] })}
            >
              <option value="unreviewed">未复核</option>
              <option value="confirmed_duplicate">确认重复</option>
              <option value="confirmed_distinct">确认非重复</option>
              <option value="needs_more_data">需更多数据</option>
            </select>
          </div>
          <div className="toolbar" style={{ padding: 0, border: 'none', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleEditSave} disabled={editLoading}>
              {editLoading ? '保存中...' : '保存'}
            </button>
            <button className="btn" onClick={() => setActiveTab('overview')}>取消</button>
          </div>
          <div className="alert-banner alert-banner--neutral" style={{ marginTop: 16 }}>
            <HelpCircle size={16} />
            <span>轻量编辑当前在 mock 模式下本地生效；真实 API 模式下需后端编辑接口或导入新版本。</span>
          </div>
        </div>
      </div>
    );
  };

  const renderImportModal = () => {
    if (!showImportModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h3>导入渠道对象</h3>
            <button className="app-icon-btn" aria-label="关闭" onClick={() => setShowImportModal(false)}><X size={16} /></button>
          </div>
          <div className="modal__body">
            <div className="segmented-control" style={{ marginBottom: 16 }}>
              <button className={`segmented-control__btn${importMode === 'basic' ? ' segmented-control__btn--active' : ''}`} onClick={() => setImportMode('basic')}>基础模板</button>
              <button className={`segmented-control__btn${importMode === 'advanced' ? ' segmented-control__btn--active' : ''}`} onClick={() => setImportMode('advanced')}>高级对象包</button>
            </div>
            {importMode === 'basic' && (
              <div className="form-group">
                <label>目标类型</label>
                <select className="form-control" value={importObjectType} onChange={(e) => setImportObjectType(e.target.value)}>
                  <option value="">请选择</option>
                  {OBJECT_TYPE_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>数据包路径 / 模板</label>
              <input
                className="form-control"
                value={importPackageTarget}
                onChange={(e) => {
                  setImportPackageTarget(e.target.value);
                  setImportDryRunResult(null);
                  setImportConfirmText('');
                }}
                placeholder="channel-profile-object-library"
              />
            </div>
            <button className="btn btn-primary" onClick={handleImportDryRun} disabled={importLoading || !importPackageTarget.trim()}>
              {importLoading ? 'Dry-run 中...' : 'Dry-run 预览'}
            </button>
            {importDryRunResult && (
              <div className="panel" style={{ marginTop: 16 }}>
                <h3 className="panel__title">Dry-run 结果</h3>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <tbody>
                      <tr><td>影响表</td><td>{importDryRunResult.affectedTables.join(', ')}</td></tr>
                      <tr><td>影响行数</td><td>{importDryRunResult.affectedRows}</td></tr>
                      <tr><td>包含授权数据</td><td>{importDryRunResult.hasUserAuthorized ? '是' : '否'}</td></tr>
                      <tr><td>警告</td><td>{importDryRunResult.warnings.join('; ') || '无'}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label>确认文本</label>
                  <input
                    className="form-control"
                    value={importConfirmText}
                    onChange={(e) => setImportConfirmText(e.target.value)}
                    placeholder={importDryRunResult.requiredConfirmText}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleImportConfirm} disabled={importLoading}>
                  {importLoading ? '导入中...' : '确认导入'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!showAnalysis) return null;
    const channelEntities = objects.filter((o) => o.targetObject === 'ChannelEntity');
    const events = objects.filter((o) => o.objectType === 'marketing_event');
    const scenarios = objects.filter((o) => o.objectType === 'business_scenario');

    return (
      <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
        <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h3>渠道对象分析视图</h3>
            <button className="app-icon-btn" aria-label="关闭" onClick={() => setShowAnalysis(false)}><X size={16} /></button>
          </div>
          <div className="modal__body">
            <div className="panel">
              <h3 className="panel__title">选择分析对象</h3>
              <div className="form-group">
                <label>渠道实体（可多选）</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 120, overflow: 'auto', padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                  {channelEntities.map((obj) => (
                    <label key={obj.canonicalObjectKey} className="tag" style={{ margin: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={analysisParams.channelEntityIds.includes(obj.canonicalObjectKey)}
                        onChange={() => toggleChannelEntity(obj.canonicalObjectKey)}
                        style={{ marginRight: 4 }}
                      />
                      {obj.displayName}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label>活动</label>
                  <select
                    className="form-control"
                    value={analysisParams.marketingEventId}
                    onChange={(e) => setAnalysisParams({ ...analysisParams, marketingEventId: e.target.value })}
                  >
                    <option value="">不选</option>
                    {events.map((e) => <option key={e.canonicalObjectKey} value={e.canonicalObjectKey}>{e.displayName}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>场景</label>
                  <select
                    className="form-control"
                    value={analysisParams.businessScenarioId}
                    onChange={(e) => setAnalysisParams({ ...analysisParams, businessScenarioId: e.target.value })}
                  >
                    <option value="">不选</option>
                    {scenarios.map((s) => <option key={s.canonicalObjectKey} value={s.canonicalObjectKey}>{s.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>SKU ID（逗号分隔）</label>
                <input
                  className="form-control"
                  value={analysisParams.skuIds.join(',')}
                  onChange={(e) => setAnalysisParams({ ...analysisParams, skuIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
              <button className="btn btn-primary" onClick={handleAnalyze} disabled={analysisLoading}>
                {analysisLoading ? '分析中...' : '生成匹配分析'}
              </button>
            </div>

            {analysisResults.length > 0 && (
              <div className="panel" style={{ marginTop: 16 }}>
                <h3 className="panel__title">分析结果</h3>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>渠道实体</th>
                        <th>匹配分</th>
                        <th>置信度</th>
                        <th>建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResults.map((r) => (
                        <tr key={r.matchId}>
                          <td>{r.skuId}</td>
                          <td>{r.channelId}</td>
                          <td>{(r.matchScore * 100).toFixed(1)}</td>
                          <td>{(r.matchConfidence * 100).toFixed(1)}</td>
                          <td><span className={`status-badge ${r.recommendation === 'avoid' ? 'status-badge--danger' : r.recommendation === 'priority_launch' ? 'status-badge--success' : 'status-badge--neutral'}`}>{r.recommendation}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="account-workbench">
      {error && (
        <div className="alert-banner alert-banner--warning">⚠️ {error}</div>
      )}
      <div className="account-workbench__body dashboard-grid">
        {renderObjectList()}
        <div className="workbench-detail">
          {!selectedKey ? (
            <div className="empty-state" style={{ minHeight: 200 }}>
              <div className="empty-state__icon">👈</div>
              <div className="empty-state__title">请在左侧选择一个对象</div>
            </div>
          ) : detailLoading && !detail ? (
            <div className="empty-state">
              <div className="empty-state__title">加载详情中...</div>
            </div>
          ) : detail ? (
            <>
              {renderDetailHeader()}
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'audience' && renderAudienceProfile()}
              {activeTab === 'productFit' && renderProductFitProfile()}
              {activeTab === 'match' && renderMatchAnalysis()}
              {activeTab === 'bindings' && renderBindings()}
              {activeTab === 'edit' && renderEdit()}
            </>
          ) : null}
        </div>
      </div>
      {renderImportModal()}
      {renderAnalysis()}
    </div>
  );
}
