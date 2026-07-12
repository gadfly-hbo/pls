import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { ChannelObject, AudienceProfile, ProductFitProfile, ChannelObjectBinding, MatchResult, AccountProfile, AccountMatchResult, MatchCorePrefill } from '../types';
import { translateTag } from '../utils/translate';
import {
  estimateSemirThreeAudienceShares,
  parseCsv,
  parseMarkdownTable,
  parseXlsx,
  pickColumn,
  threeAudienceInputTotalTolerance,
  validateAndBuildSegments,
  validateShareTotal,
  formatShareAsPercent,
  LABEL_COLUMN_CANDIDATES,
  SHARE_COLUMN_CANDIDATES,
} from '../utils/three-audience-local-parser';
import type {
  ThreeAudienceChannel,
  ThreeAudienceEstimateResult,
  NativeSegmentSystem,
} from '../utils/three-audience-local-parser';
import {
  Search,
  Import,
  BarChart3,
  AlertTriangle,
  HelpCircle,
  X,
  Layers,
  FileSpreadsheet,
  FolderOpen,
  Upload,
  Calculator,
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

const OBJECT_VIEW_OPTIONS = [
  { value: 'channelEntities', label: '渠道实体' },
  { value: 'marketingEvents', label: '活动' },
  { value: 'businessScenarios', label: '场景' },
] as const;

type ObjectView = typeof OBJECT_VIEW_OPTIONS[number]['value'];

const THREE_AUDIENCE_CHANNELS: { value: ThreeAudienceChannel; label: string }[] = [
  { value: 'douyin', label: '抖音' },
  { value: 'tmall', label: '天猫' },
  { value: 'jd', label: '京东' },
  { value: 'offline', label: '线下' },
  { value: 'vip', label: '唯品会' },
  { value: 'wechat_channels', label: '视频号' },
  { value: 'pinduoduo', label: '拼多多' },
];

const CHANNEL_SYSTEM: Record<ThreeAudienceChannel, NativeSegmentSystem> = {
  douyin: 'douyin_eight',
  tmall: 'tmall_industry_six',
  jd: 'jd_ten',
  offline: 'offline_industry_six',
  vip: 'vip_eleven',
  wechat_channels: 'wechat_channels_seven',
  pinduoduo: 'pinduoduo_ten',
};

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

function translateEventType(type: string | null | undefined): string {
  switch (type) {
    case 'platform_promotion': return '平台大促';
    case 'brand_campaign': return '品牌活动';
    case 'content_campaign': return '内容营销';
    default: return type || '-';
  }
}

function translateScenarioType(type: string | null | undefined): string {
  switch (type) {
    case 'new_product_launch': return '新品首发';
    case 'daily_operation': return '日常经营';
    case 'inventory_clearance': return '库存清理';
    default: return type || '-';
  }
}

function translateBindingType(type: string): string {
  switch (type) {
    case 'event_channel': return '活动关联渠道';
    case 'scenario_channel': return '场景适用渠道';
    default: return type;
  }
}

function getAttributeText(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === 'string' && value.trim() ? value : '-';
}

function getAttributeTags(attributes: Record<string, unknown>, key: string): string[] {
  const value = attributes[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
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

export default function ChannelObjectLibrary({ goToMatchCore }: { goToMatchCore?: (prefill: MatchCorePrefill) => void }) {
  const { objects, loading, error, refetch } = useChannelObjects();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [objectView, setObjectView] = useState<ObjectView>('channelEntities');
  const [searchQuery, setSearchQuery] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState('');
  const [platformTypeFilter, setPlatformTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'audience' | 'productFit' | 'match' | 'bindings' | 'edit' | 'threeAudience'>('overview');
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
  const [importExecuteResult, setImportExecuteResult] = useState<any>(null);
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

  const [threeAudienceFile, setThreeAudienceFile] = useState<File | null>(null);
  const [threeAudienceCandidateFiles, setThreeAudienceCandidateFiles] = useState<File[]>([]);
  const [threeAudienceParsed, setThreeAudienceParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [threeAudienceLabelColumn, setThreeAudienceLabelColumn] = useState('');
  const [threeAudienceShareColumn, setThreeAudienceShareColumn] = useState('');
  const [threeAudienceChannel, setThreeAudienceChannel] = useState<ThreeAudienceChannel | ''>('');
  const [threeAudiencePriorA, setThreeAudiencePriorA] = useState('');
  const [threeAudiencePriorB, setThreeAudiencePriorB] = useState('');
  const [threeAudiencePriorC, setThreeAudiencePriorC] = useState('');
  const [threeAudienceSegments, setThreeAudienceSegments] = useState<{ rowNumber: number; label: string; rawShare: string; share: number }[]>([]);
  const [threeAudienceIgnoredRows, setThreeAudienceIgnoredRows] = useState(0);
  const [threeAudienceErrors, setThreeAudienceErrors] = useState<{ rowNumber: number; reason: string }[]>([]);
  const [threeAudienceTotalError, setThreeAudienceTotalError] = useState<string | null>(null);
  const [threeAudienceResult, setThreeAudienceResult] = useState<ThreeAudienceEstimateResult | null>(null);
  const [threeAudienceAlgorithmError, setThreeAudienceAlgorithmError] = useState<string | null>(null);
  const [threeAudienceLoading, setThreeAudienceLoading] = useState(false);
  const [threeAudienceMappingConfirmed, setThreeAudienceMappingConfirmed] = useState(false);

  const filteredObjects = useMemo(() => {
    return objects.filter((obj) => {
      const matchesView =
        objectView === 'marketingEvents'
          ? obj.objectType === 'marketing_event'
          : objectView === 'businessScenarios'
            ? obj.objectType === 'business_scenario'
            : obj.targetObject === 'ChannelEntity';
      const matchesSearch =
        obj.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.canonicalObjectKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.sourceStableKey.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !objectTypeFilter || obj.objectType === objectTypeFilter;
      const matchesPlatform = !platformTypeFilter || obj.platformType === platformTypeFilter;
      return matchesView && matchesSearch && matchesType && matchesPlatform;
    });
  }, [objects, objectView, searchQuery, objectTypeFilter, platformTypeFilter]);

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
    if (filteredObjects.length === 0) return;
    if (!selectedKey || !filteredObjects.some((obj) => obj.canonicalObjectKey === selectedKey)) {
      setSelectedKey(filteredObjects[0].canonicalObjectKey);
    }
  }, [filteredObjects, selectedKey]);

  const handleObjectViewChange = (view: ObjectView) => {
    setObjectView(view);
    setObjectTypeFilter('');
    setPlatformTypeFilter('');
    setActiveTab('overview');
  };

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
    setImportExecuteResult(null);
    try {
      const res = await api.dryRunDbOperation('IMPORT', target);
      setImportDryRunResult(res.data);
    } catch (err: any) {
      alert('导入前检查失败: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    const target = importPackageTarget.trim();
    if (!importConfirmText || !target) return;
    setImportLoading(true);
    try {
      const res = await api.executeDbOperation('IMPORT', target, importConfirmText);
      setImportExecuteResult(res.data);
      setImportConfirmText('');
      refetch();
    } catch (err: any) {
      alert('导入失败: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (analysisParams.channelEntityIds.length === 0 || analysisParams.skuIds.length === 0) return;
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

  const findObject = (canonicalObjectKey: string) => objects.find((obj) => obj.canonicalObjectKey === canonicalObjectKey);

  const selectedAnalysisChannels = analysisParams.channelEntityIds
    .map((key) => findObject(key))
    .filter((obj): obj is ChannelObject => Boolean(obj));

  const selectedAnalysisEvent = analysisParams.marketingEventId ? findObject(analysisParams.marketingEventId) : null;
  const selectedAnalysisScenario = analysisParams.businessScenarioId ? findObject(analysisParams.businessScenarioId) : null;

  const openMatchCore = (prefill: MatchCorePrefill) => {
    if (!goToMatchCore) return;
    setShowAnalysis(false);
    goToMatchCore(prefill);
  };

  const resetThreeAudienceState = () => {
    setThreeAudienceParsed(null);
    setThreeAudienceLabelColumn('');
    setThreeAudienceShareColumn('');
    setThreeAudienceMappingConfirmed(false);
    setThreeAudienceSegments([]);
    setThreeAudienceIgnoredRows(0);
    setThreeAudienceErrors([]);
    setThreeAudienceTotalError(null);
    setThreeAudienceResult(null);
    setThreeAudienceAlgorithmError(null);
  };

  const buildThreeAudienceSegments = (
    rows: Record<string, string>[],
    labelColumn: string,
    shareColumn: string,
    channel: ThreeAudienceChannel
  ) => {
    const { segments, errors, ignoredRows } = validateAndBuildSegments(rows, { labelColumn, shareColumn }, channel);
    setThreeAudienceSegments(segments);
    setThreeAudienceErrors(errors);
    setThreeAudienceIgnoredRows(ignoredRows);
    const totalError = validateShareTotal(segments, channel);
    setThreeAudienceTotalError(totalError);
  };

  const parseThreeAudienceFile = async (file: File) => {
    resetThreeAudienceState();
    setThreeAudienceFile(file);
    setThreeAudienceCandidateFiles([]);
    const lowerName = file.name.toLowerCase();
    try {
      let parsed: { headers: string[]; rows: Record<string, string>[] };
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        parsed = await parseXlsx(arrayBuffer);
      } else if (lowerName.endsWith('.md')) {
        const text = await file.text();
        parsed = parseMarkdownTable(text);
      } else {
        const text = await file.text();
        parsed = parseCsv(text);
      }
      setThreeAudienceParsed(parsed);
      const detectedLabel = pickColumn(parsed.headers, LABEL_COLUMN_CANDIDATES, 'none');
      const detectedShare = pickColumn(parsed.headers, SHARE_COLUMN_CANDIDATES, 'none');
      setThreeAudienceLabelColumn(detectedLabel ?? (parsed.headers[0] || ''));
      setThreeAudienceShareColumn(detectedShare ?? (parsed.headers[1] || ''));
      setThreeAudienceMappingConfirmed(false);
      setThreeAudienceSegments([]);
      setThreeAudienceIgnoredRows(0);
      setThreeAudienceErrors([]);
      setThreeAudienceTotalError(null);
    } catch (err: any) {
      setThreeAudienceAlgorithmError(`文件解析失败：${err.message || '未知错误'}`);
    }
  };

  const handleThreeAudienceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseThreeAudienceFile(file);
  };

  const handleThreeAudienceFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const candidates = Array.from(files).filter((f) => {
      const lowerName = f.name.toLowerCase();
      return lowerName.endsWith('.csv') || lowerName.endsWith('.md') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    });
    setThreeAudienceCandidateFiles(candidates);
    if (candidates.length === 1) {
      parseThreeAudienceFile(candidates[0]);
    } else {
      resetThreeAudienceState();
      setThreeAudienceFile(null);
    }
  };

  const handleThreeAudienceCandidateSelect = (file: File) => {
    parseThreeAudienceFile(file);
  };

  const handleThreeAudienceMappingChange = (labelColumn: string, shareColumn: string) => {
    setThreeAudienceLabelColumn(labelColumn);
    setThreeAudienceShareColumn(shareColumn);
    setThreeAudienceMappingConfirmed(false);
    setThreeAudienceSegments([]);
    setThreeAudienceIgnoredRows(0);
    setThreeAudienceErrors([]);
    setThreeAudienceTotalError(null);
    setThreeAudienceResult(null);
    setThreeAudienceAlgorithmError(null);
  };

  const handleThreeAudienceConfirmMapping = () => {
    if (!threeAudienceParsed || !threeAudienceChannel) return;
    buildThreeAudienceSegments(threeAudienceParsed.rows, threeAudienceLabelColumn, threeAudienceShareColumn, threeAudienceChannel);
    setThreeAudienceMappingConfirmed(true);
    setThreeAudienceResult(null);
    setThreeAudienceAlgorithmError(null);
  };

  const handleThreeAudienceChannelChange = (channel: ThreeAudienceChannel | '') => {
    setThreeAudienceChannel(channel);
    setThreeAudienceMappingConfirmed(false);
    setThreeAudienceSegments([]);
    setThreeAudienceIgnoredRows(0);
    setThreeAudienceErrors([]);
    setThreeAudienceTotalError(null);
    setThreeAudienceResult(null);
    setThreeAudienceAlgorithmError(null);
  };

  const handleThreeAudienceCalculate = () => {
    if (!threeAudienceChannel || threeAudienceErrors.length > 0 || threeAudienceTotalError || threeAudienceSegments.length === 0) return;
    setThreeAudienceLoading(true);
    setThreeAudienceResult(null);
    setThreeAudienceAlgorithmError(null);
    try {
      const priorA = parseFloat(threeAudiencePriorA);
      const priorB = parseFloat(threeAudiencePriorB);
      const priorC = parseFloat(threeAudiencePriorC);
      const hasPrior =
        threeAudiencePriorA.trim() !== '' &&
        threeAudiencePriorB.trim() !== '' &&
        threeAudiencePriorC.trim() !== '';
      const expertPrior = hasPrior
        ? { a: priorA, b: priorB, c: priorC }
        : undefined;
      const result = estimateSemirThreeAudienceShares({
        brand: 'semir',
        channel: threeAudienceChannel,
        distribution: {
          system: CHANNEL_SYSTEM[threeAudienceChannel],
          segments: threeAudienceSegments.map((s) => ({ label: s.label, share: s.share })),
        },
        expertPrior,
      });
      setThreeAudienceResult(result);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      setThreeAudienceAlgorithmError(message);
    } finally {
      setThreeAudienceLoading(false);
    }
  };

  const isThreeAudiencePriorValid = (): boolean => {
    if (threeAudiencePriorA.trim() === '' && threeAudiencePriorB.trim() === '' && threeAudiencePriorC.trim() === '') return true;
    const a = parseFloat(threeAudiencePriorA);
    const b = parseFloat(threeAudiencePriorB);
    const c = parseFloat(threeAudiencePriorC);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return false;
    if (a < 0 || a > 1 || b < 0 || b > 1 || c < 0 || c > 1) return false;
    return Math.abs(a + b + c - 1) <= 1e-6;
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
        <div className="segmented-control" style={{ width: '100%', marginBottom: 10 }}>
          {OBJECT_VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`segmented-control__btn${objectView === opt.value ? ' segmented-control__btn--active' : ''}`}
              onClick={() => handleObjectViewChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
    const tabs = detail.objectType === 'marketing_event' || detail.objectType === 'business_scenario'
      ? [
          { id: 'overview', label: '总览' },
          { id: 'bindings', label: detail.objectType === 'marketing_event' ? '关联渠道' : '适用渠道' },
          { id: 'edit', label: '编辑' },
        ]
      : [
          { id: 'overview', label: '总览' },
          { id: 'audience', label: '人群画像' },
          { id: 'productFit', label: '商品适配' },
          { id: 'match', label: '匹配分析' },
          { id: 'bindings', label: '绑定关系' },
          { id: 'edit', label: '编辑' },
          { id: 'threeAudience', label: '三大人群' },
        ];
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
            {tabs.map((tab) => (
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
    if (detail.objectType === 'marketing_event') return renderMarketingEventOverview(detail);
    if (detail.objectType === 'business_scenario') return renderBusinessScenarioOverview(detail);
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
                  <td style={{ width: 140, color: 'var(--muted-foreground)' }}>对象标识</td>
                  <td>{detail.canonicalObjectKey}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>对象版本 ID</td>
                  <td>{detail.objectVersionId}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>来源稳定键</td>
                  <td>{detail.sourceStableKey}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>标识来源</td>
                  <td>{detail.keySource}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>对象状态</td>
                  <td>{detail.entityStatus}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>时间窗口</td>
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

  const renderMarketingEventOverview = (event: ChannelObject) => {
    const eventType = getAttributeText(event.entityAttributes, 'eventType');
    const customTags = getAttributeTags(event.entityAttributes, 'customTags');
    const relatedChannelCount = bindings.filter((binding) => binding.bindingType === 'event_channel').length;

    return (
      <div className="workbench-detail">
        {renderQualityFlags(event.qualityFlags)}
        <div className="metric-grid">
          <div className="metric-card metric-card--compact">
            <div className="metric-title">活动类型</div>
            <div className="metric-value">{translateEventType(eventType)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">活动周期</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{formatTimeWindow(event.timeWindow)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">关联渠道数量</div>
            <div className="metric-value">{relatedChannelCount}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">数据版本</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{event.dataVersion}</div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel__title">活动上下文</h3>
          <div className="data-table-wrapper">
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ width: 140, color: 'var(--muted-foreground)' }}>活动标签</td>
                  <td>
                    {customTags.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {customTags.map((tag) => <span key={tag} className="tag" style={{ margin: 0 }}>{tag}</span>)}
                      </div>
                    ) : '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>匹配上下文</td>
                  <td>用于限定商品与渠道匹配发生的活动窗口、促销机制和内容主题，帮助判断该渠道是否适合承接当前活动目标。</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>来源</td>
                  <td>{event.source} / {event.sourceBatchId}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderBusinessScenarioOverview = (scenario: ChannelObject) => {
    const scenarioType = getAttributeText(scenario.entityAttributes, 'scenarioType');
    const description = getAttributeText(scenario.entityAttributes, 'description');
    const businessGoal = getAttributeText(scenario.entityAttributes, 'businessGoal');
    const applicableCondition = getAttributeText(scenario.entityAttributes, 'applicableCondition');
    const relatedChannelCount = bindings.filter((binding) => binding.bindingType === 'scenario_channel').length;

    return (
      <div className="workbench-detail">
        {renderQualityFlags(scenario.qualityFlags)}
        <div className="metric-grid">
          <div className="metric-card metric-card--compact">
            <div className="metric-title">场景类型</div>
            <div className="metric-value">{translateScenarioType(scenarioType)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">适用周期</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{formatTimeWindow(scenario.timeWindow)}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">关联渠道数量</div>
            <div className="metric-value">{relatedChannelCount}</div>
          </div>
          <div className="metric-card metric-card--compact">
            <div className="metric-title">复核状态</div>
            <div className="metric-value" style={{ fontSize: 14 }}>{scenario.manualReviewStatus}</div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel__title">场景上下文</h3>
          <div className="data-table-wrapper">
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ width: 140, color: 'var(--muted-foreground)' }}>场景说明</td>
                  <td>{description}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>业务目标</td>
                  <td>{businessGoal !== '-' ? businessGoal : '围绕该业务场景筛选更适合承接的人货渠道组合。'}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>适用条件</td>
                  <td>{applicableCondition !== '-' ? applicableCondition : '适用于同一周期内需要结合渠道画像、商品适配和活动资源判断投放优先级的决策。'}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--muted-foreground)' }}>匹配上下文</td>
                  <td>作为商品与渠道匹配的业务约束，帮助解释为什么某些渠道在新品首发、日常经营或清仓等场景下优先级不同。</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
          <button
            className="btn"
            onClick={() => openMatchCore({ channelId: selectedKey, skuId: matchAnalysisSkuId, sourceLabel: detail.displayName })}
            disabled={!goToMatchCore}
          >
            去货渠匹配模块
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

  const getBindingObjectSummary = (binding: ChannelObjectBinding, side: 'from' | 'to') => {
    const objectRef = side === 'from' ? binding.fromObject : binding.toObject;
    const canonicalObjectKey = side === 'from' ? binding.fromCanonicalObjectKey : binding.toCanonicalObjectKey;
    const object = findObject(canonicalObjectKey);
    return {
      canonicalObjectKey,
      displayName: objectRef.displayName || object?.displayName || canonicalObjectKey,
      objectType: objectRef.objectType || object?.objectType || null,
      dataVersion: objectRef.dataVersion || object?.dataVersion || binding.dataVersion,
    };
  };

  const renderObjectSummaryCell = (summary: ReturnType<typeof getBindingObjectSummary>) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{summary.displayName}</span>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12, overflowWrap: 'anywhere' }}>
        {summary.objectType ? translateObjectType(summary.objectType) : '未知类型'} · {summary.canonicalObjectKey}
      </span>
    </div>
  );

  const renderBindings = () => {
    const isContextObject = detail?.objectType === 'marketing_event' || detail?.objectType === 'business_scenario';
    const title = detail?.objectType === 'marketing_event'
      ? '关联渠道'
      : detail?.objectType === 'business_scenario'
        ? '适用渠道'
        : '绑定关系';

    return (
      <div className="workbench-detail">
        {bindings.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <div className="empty-state__icon">🔗</div>
            <div className="empty-state__title">暂无{title}</div>
          </div>
        ) : (
          <div className="panel">
            <h3 className="panel__title">{title}</h3>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>绑定类型</th>
                    {isContextObject ? <th>渠道名称</th> : <th>源对象</th>}
                    {isContextObject ? <th>对象类型</th> : <th>目标对象</th>}
                    <th>版本</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((binding) => {
                    const from = getBindingObjectSummary(binding, 'from');
                    const to = getBindingObjectSummary(binding, 'to');
                    const related = detail?.canonicalObjectKey === binding.fromCanonicalObjectKey ? to : from;

                    return (
                      <tr key={binding.bindingId}>
                        <td>{translateBindingType(binding.bindingType)}</td>
                        {isContextObject ? (
                          <>
                            <td>{renderObjectSummaryCell(related)}</td>
                            <td>{related.objectType ? translateObjectType(related.objectType) : '未知类型'}</td>
                          </>
                        ) : (
                          <>
                            <td>{renderObjectSummaryCell(from)}</td>
                            <td>{renderObjectSummaryCell(to)}</td>
                          </>
                        )}
                        <td>{related.dataVersion || binding.dataVersion}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

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

  const renderThreeAudience = () => {
    if (!detail) return null;
    const canCalculate =
      threeAudienceMappingConfirmed &&
      threeAudienceChannel !== '' &&
      threeAudienceSegments.length > 0 &&
      threeAudienceErrors.length === 0 &&
      !threeAudienceTotalError &&
      isThreeAudiencePriorValid();
    const canConfirmMapping = threeAudienceChannel !== '' && threeAudienceLabelColumn !== '' && threeAudienceShareColumn !== '';
    const threeAudienceTotalLimitLabel = threeAudienceChannel
      ? formatShareAsPercent(1 + threeAudienceInputTotalTolerance(threeAudienceChannel))
      : '约 100.10%';

    return (
      <div className="workbench-detail">
        <div className="alert-banner alert-banner--neutral" style={{ marginBottom: 16 }}>
          <Upload size={16} />
          <span>文件和结果仅在当前浏览器会话保留，不上传、不落库。</span>
        </div>

        <div className="panel">
          <h3 className="panel__title">选择本地文件</h3>
          <div className="form-group" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => document.getElementById('three-audience-file')?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <FileSpreadsheet size={14} /> 选择文件
            </button>
            <input
              id="three-audience-file"
              type="file"
              accept=".csv,.md,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleThreeAudienceFileChange}
            />
            <button
              className="btn"
              onClick={() => document.getElementById('three-audience-folder')?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <FolderOpen size={14} /> 选择文件夹
            </button>
            <input
              id="three-audience-folder"
              type="file"
              /* @ts-expect-error webkitdirectory/directory are non-standard attrs for folder picker */
              webkitdirectory=""
              directory=""
              style={{ display: 'none' }}
              onChange={handleThreeAudienceFolderChange}
            />
          </div>
          {threeAudienceFile && (
            <div style={{ marginTop: 12, fontSize: 14, wordBreak: 'break-all' }}>
              已选文件：<span className="tag" style={{ margin: 0 }}>{threeAudienceFile.name}</span>
            </div>
          )}
          {threeAudienceCandidateFiles.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 8 }}>文件夹中候选文件（请选择一个）：</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {threeAudienceCandidateFiles.map((file) => (
                  <button
                    key={file.name}
                    className={`tag ${threeAudienceFile?.name === file.name ? 'status-badge--success' : ''}`}
                    style={{ margin: 0, cursor: 'pointer' }}
                    onClick={() => handleThreeAudienceCandidateSelect(file)}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {threeAudienceParsed && threeAudienceParsed.headers.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">列映射</h3>
            <div className="form-group" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>渠道</label>
                <select
                  className="form-control"
                  data-testid="three-audience-channel"
                  value={threeAudienceChannel}
                  onChange={(e) => handleThreeAudienceChannelChange(e.target.value as ThreeAudienceChannel | '')}
                >
                  <option value="">请选择渠道</option>
                  {THREE_AUDIENCE_CHANNELS.map((ch) => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>标签列</label>
                <select
                  className="form-control"
                  data-testid="three-audience-label-column"
                  value={threeAudienceLabelColumn}
                  onChange={(e) => handleThreeAudienceMappingChange(e.target.value, threeAudienceShareColumn)}
                >
                  {threeAudienceParsed.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>占比列</label>
                <select
                  className="form-control"
                  data-testid="three-audience-share-column"
                  value={threeAudienceShareColumn}
                  onChange={(e) => handleThreeAudienceMappingChange(threeAudienceLabelColumn, e.target.value)}
                >
                  {threeAudienceParsed.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
            {!threeAudienceMappingConfirmed && (
              <button
                className="btn btn-primary"
                data-testid="three-audience-confirm-mapping"
                onClick={handleThreeAudienceConfirmMapping}
                disabled={!canConfirmMapping}
                style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Calculator size={14} /> 确认列映射
              </button>
            )}
            {threeAudienceMappingConfirmed && (
              <div className="alert-banner alert-banner--success" style={{ marginTop: 12, background: 'var(--background)' }}>
                <span>列映射已确认，已忽略 {threeAudienceIgnoredRows} 行非该渠道原生人群标签；占比合计约 {threeAudienceTotalLimitLabel} 以内按四舍五入误差处理。</span>
              </div>
            )}
          </div>
        )}

        {threeAudienceMappingConfirmed && threeAudienceParsed && threeAudienceParsed.headers.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">行级输入</h3>
            <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>标签</th>
                    <th>原始占比</th>
                    <th>解析后 share</th>
                  </tr>
                </thead>
                <tbody>
                  {threeAudienceSegments.map((segment) => (
                    <tr key={segment.label}>
                      <td>{segment.rowNumber}</td>
                      <td>{segment.label}</td>
                      <td>{segment.rawShare}</td>
                      <td>{formatShareAsPercent(segment.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {threeAudienceErrors.length > 0 && (
              <div className="alert-banner alert-banner--warning" style={{ marginTop: 16 }}>
                <AlertTriangle size={16} />
                <div>
                  <div style={{ marginBottom: 4 }}>以下行存在错误，请先修正源文件后再计算：</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                    {threeAudienceErrors.map((err) => (
                      <li key={err.rowNumber}>第 {err.rowNumber} 行：{err.reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {threeAudienceTotalError && (
              <div className="alert-banner alert-banner--warning" style={{ marginTop: 16 }}>
                <AlertTriangle size={16} />
                <span>{threeAudienceTotalError}</span>
              </div>
            )}
          </div>
        )}

        {threeAudienceMappingConfirmed && threeAudienceParsed && threeAudienceParsed.headers.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">专家先验</h3>
            <div className="form-group">
              <label>专家先验 A/B/C（可选，三项和为 1）</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <input
                  className="form-control"
                  data-testid="three-audience-prior-a"
                  placeholder="A 先验"
                  value={threeAudiencePriorA}
                  onChange={(e) => { setThreeAudiencePriorA(e.target.value); setThreeAudienceResult(null); setThreeAudienceAlgorithmError(null); }}
                />
                <input
                  className="form-control"
                  data-testid="three-audience-prior-b"
                  placeholder="B 先验"
                  value={threeAudiencePriorB}
                  onChange={(e) => { setThreeAudiencePriorB(e.target.value); setThreeAudienceResult(null); setThreeAudienceAlgorithmError(null); }}
                />
                <input
                  className="form-control"
                  data-testid="three-audience-prior-c"
                  placeholder="C 先验"
                  value={threeAudiencePriorC}
                  onChange={(e) => { setThreeAudiencePriorC(e.target.value); setThreeAudienceResult(null); setThreeAudienceAlgorithmError(null); }}
                />
              </div>
              {!isThreeAudiencePriorValid() && (
                <div style={{ color: 'var(--destructive)', fontSize: 13, marginTop: 8 }}>
                  先验必须为空或三项均为 0-1 且和为 1
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              data-testid="three-audience-calculate"
              onClick={handleThreeAudienceCalculate}
              disabled={!canCalculate || threeAudienceLoading}
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Calculator size={14} /> {threeAudienceLoading ? '计算中...' : '计算三大人群'}
            </button>
          </div>
        )}

        {threeAudienceAlgorithmError && (
          <div className="alert-banner alert-banner--warning">
            <AlertTriangle size={16} />
            <span>计算失败：{threeAudienceAlgorithmError}</span>
          </div>
        )}

        {threeAudienceResult && (
          <div className="panel">
            <h3 className="panel__title">估算结果</h3>
            <div className="metric-grid">
              {threeAudienceResult.shares.map((share) => (
                <div key={share.code} className="metric-card metric-card--compact">
                  <div className="metric-title">{share.code} {share.name}</div>
                  <div className="metric-value">{formatShareAsPercent(share.share)}</div>
                </div>
              ))}
              <div className="metric-card metric-card--compact">
                <div className="metric-title">覆盖率 coverage</div>
                <div className="metric-value">{formatShareAsPercent(threeAudienceResult.coverage)}</div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">未覆盖 uncovered</div>
                <div className="metric-value">{formatShareAsPercent(threeAudienceResult.uncovered)}</div>
              </div>
            </div>
            <div className="data-table-wrapper" style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td style={{ width: 140, color: 'var(--muted-foreground)' }}>算法版本</td>
                    <td>{threeAudienceResult.algorithmVersion}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted-foreground)' }}>模式 mode</td>
                    <td>{threeAudienceResult.mode}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted-foreground)' }}>质量标记</td>
                    <td>
                      {threeAudienceResult.qualityFlags.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {threeAudienceResult.qualityFlags.map((flag) => (
                            <span key={flag} className="tag" style={{ margin: 0 }}>{flag}</span>
                          ))}
                        </div>
                      ) : (
                        '无'
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted-foreground)' }}>未映射标签</td>
                    <td>
                      {threeAudienceResult.unmappedSegments.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {threeAudienceResult.unmappedSegments.map((s) => (
                            <span key={s.label} className="tag" style={{ margin: 0 }}>{s.label} ({formatShareAsPercent(s.share)})</span>
                          ))}
                        </div>
                      ) : (
                        '无'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderImportModal = () => {
    if (!showImportModal) return null;
    const requiredConfirmText = String(importDryRunResult?.requiredConfirmText || '');
    const canConfirmImport = Boolean(importDryRunResult) && importConfirmText === requiredConfirmText;
    const importSteps = [
      { title: '1. 选择导入目标', done: importMode === 'advanced' || Boolean(importObjectType) },
      { title: '2. 选择模板或数据包', done: Boolean(importPackageTarget.trim()) },
      { title: '3. 导入前检查', done: Boolean(importDryRunResult) },
      { title: '4. 输入确认文本', done: Boolean(importDryRunResult) && canConfirmImport },
      { title: '5. 导入结果', done: Boolean(importExecuteResult) },
    ];

    return (
      <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
        <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h3>导入渠道对象</h3>
            <button className="app-icon-btn" aria-label="关闭" onClick={() => setShowImportModal(false)}><X size={16} /></button>
          </div>
          <div className="modal__body">
            <div className="alert-banner alert-banner--info" style={{ marginBottom: 16 }}>
              导入会先执行导入前检查，再要求输入后端返回的确认文本；不会绕过 Admin Import 的审计和幂等保护。
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
              {importSteps.map((step) => (
                <div key={step.title} className="metric-card metric-card--compact" style={{ background: step.done ? 'var(--background)' : 'var(--card)' }}>
                  <div className="metric-title">{step.title}</div>
                  <div className={`status-badge ${step.done ? 'status-badge--success' : 'status-badge--neutral'}`} style={{ width: 'fit-content' }}>
                    {step.done ? '已完成' : '待完成'}
                  </div>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3 className="panel__title">1. 选择导入目标</h3>
              <div className="segmented-control" style={{ marginBottom: 16 }}>
                <button className={`segmented-control__btn${importMode === 'basic' ? ' segmented-control__btn--active' : ''}`} onClick={() => setImportMode('basic')}>按对象模板导入</button>
                <button className={`segmented-control__btn${importMode === 'advanced' ? ' segmented-control__btn--active' : ''}`} onClick={() => setImportMode('advanced')}>导入完整对象包</button>
              </div>
              {importMode === 'basic' && (
                <div className="form-group">
                  <label>目标对象类型</label>
                  <select className="form-control" value={importObjectType} onChange={(e) => setImportObjectType(e.target.value)}>
                    <option value="">请选择</option>
                    {OBJECT_TYPE_OPTIONS.filter((o) => o.value).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                {importMode === 'basic' ? '适合只补充某类渠道对象的模板导入。' : '适合导入包含渠道实体、活动、场景和绑定关系的对象包。'}
              </div>
            </div>

            <div className="panel">
              <h3 className="panel__title">2. 选择模板或数据包</h3>
              <div className="form-group">
                <label>数据包路径 / 模板</label>
                <input
                  className="form-control"
                  value={importPackageTarget}
                  onChange={(e) => {
                    setImportPackageTarget(e.target.value);
                    setImportDryRunResult(null);
                    setImportExecuteResult(null);
                    setImportConfirmText('');
                  }}
                  placeholder="channel-profile-object-library"
                />
              </div>
              <button className="btn btn-primary" onClick={handleImportDryRun} disabled={importLoading || !importPackageTarget.trim()}>
                {importLoading ? '检查中...' : '执行导入前检查'}
              </button>
              <div style={{ marginTop: 10, color: 'var(--muted-foreground)', fontSize: 13 }}>
                系统会先检查影响表、影响行数、授权数据和审计风险，再返回必须手动输入的确认文本。
              </div>
            </div>

            {importDryRunResult && (
              <div className="panel">
                <h3 className="panel__title">3. 导入前检查</h3>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <tbody>
                      <tr><td>影响表</td><td>{importDryRunResult.affectedTables.join(', ')}</td></tr>
                      <tr><td>影响行数</td><td>{importDryRunResult.affectedRows}</td></tr>
                      <tr><td>包含授权数据</td><td>{importDryRunResult.hasUserAuthorized ? '是' : '否'}</td></tr>
                      <tr><td>审计/历史风险</td><td>{importDryRunResult.hasAuditHistory ? '存在，需要谨慎确认' : '未发现'}</td></tr>
                      <tr><td>警告</td><td>{importDryRunResult.warnings.join('; ') || '无'}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label>4. 输入确认文本</label>
                  <div className="alert-banner alert-banner--warning" style={{ marginBottom: 10 }}>
                    必须输入完全一致的确认文本：<strong>{requiredConfirmText}</strong>
                  </div>
                  <input
                    className="form-control"
                    value={importConfirmText}
                    onChange={(e) => setImportConfirmText(e.target.value)}
                    placeholder={requiredConfirmText}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleImportConfirm} disabled={importLoading || !canConfirmImport}>
                  {importLoading ? '导入中...' : '确认导入'}
                </button>
              </div>
            )}

            {importExecuteResult && (
              <div className="panel">
                <h3 className="panel__title">5. 导入结果</h3>
                <div className="alert-banner alert-banner--success">
                  导入请求已完成，审计 ID：{importExecuteResult.auditId || '未返回'}。
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => setShowImportModal(false)}>返回对象库</button>
                </div>
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
    const canAnalyze = analysisParams.channelEntityIds.length > 0 && analysisParams.skuIds.length > 0;
    const analysisSteps = [
      { title: '1. 选择渠道实体', done: analysisParams.channelEntityIds.length > 0 },
      { title: '2. 选择活动/场景上下文', done: Boolean(analysisParams.marketingEventId || analysisParams.businessScenarioId) },
      { title: '3. 输入商品 SKU', done: analysisParams.skuIds.length > 0 },
      { title: '4. 生成结果', done: analysisResults.length > 0 },
    ];

    return (
      <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
        <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h3>批量货渠匹配分析</h3>
            <button className="app-icon-btn" aria-label="关闭" onClick={() => setShowAnalysis(false)}><X size={16} /></button>
          </div>
          <div className="modal__body">
            <div className="alert-banner alert-banner--info" style={{ marginBottom: 16 }}>
              按步骤选择渠道实体、活动/场景上下文和商品 SKU，生成用于业务预判的批量匹配结果；真实 API 未开放时不会伪装为正式后端结果。
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
              {analysisSteps.map((step) => (
                <div key={step.title} className="metric-card metric-card--compact" style={{ background: step.done ? 'var(--background)' : 'var(--card)' }}>
                  <div className="metric-title">{step.title}</div>
                  <div className={`status-badge ${step.done ? 'status-badge--success' : 'status-badge--neutral'}`} style={{ width: 'fit-content' }}>
                    {step.done ? '已完成' : '待完成'}
                  </div>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3 className="panel__title">1. 选择渠道实体</h3>
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
            </div>

            <div className="panel">
              <h3 className="panel__title">2. 选择活动/场景上下文</h3>
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
              <div className="alert-banner alert-banner--neutral" style={{ marginTop: 12 }}>
                活动用于限定促销窗口和主题，场景用于限定业务目标；两者会作为本次匹配解释的上下文展示。
              </div>
              {(selectedAnalysisEvent || selectedAnalysisScenario) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {selectedAnalysisEvent && <span className="tag" style={{ margin: 0 }}>活动：{selectedAnalysisEvent.displayName}</span>}
                  {selectedAnalysisScenario && <span className="tag" style={{ margin: 0 }}>场景：{selectedAnalysisScenario.displayName}</span>}
                </div>
              )}
            </div>

            <div className="panel">
              <h3 className="panel__title">3. 输入商品 SKU</h3>
              <div className="form-group">
                <label>SKU ID（逗号分隔）</label>
                <input
                  className="form-control"
                  value={analysisParams.skuIds.join(',')}
                  onChange={(e) => setAnalysisParams({ ...analysisParams, skuIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 12 }}>
                当前将分析 {selectedAnalysisChannels.length} 个渠道实体、{analysisParams.skuIds.length} 个 SKU。
              </div>
              <button className="btn btn-primary" onClick={handleAnalyze} disabled={analysisLoading || !canAnalyze}>
                {analysisLoading ? '分析中...' : '生成匹配分析'}
              </button>
            </div>

            {analysisResults.length > 0 && (
              <div className="panel" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <h3 className="panel__title" style={{ margin: 0 }}>4. 分析结果</h3>
                  <button
                    className="btn"
                    onClick={() => openMatchCore({
                      channelId: analysisParams.channelEntityIds[0],
                      skuId: analysisParams.skuIds[0],
                      sourceLabel: selectedAnalysisChannels[0]?.displayName || analysisParams.channelEntityIds[0],
                    })}
                    disabled={!goToMatchCore}
                  >
                    去货渠匹配模块查看
                  </button>
                </div>
                <div className="alert-banner alert-banner--success" style={{ marginBottom: 12 }}>
                  已生成 {analysisResults.length} 条匹配结果；活动/场景上下文仅作为解释条件展示，不代表自动执行投放。
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>渠道实体</th>
                        <th>活动/场景上下文</th>
                        <th>匹配分</th>
                        <th>置信度</th>
                        <th>建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResults.map((r) => (
                        <tr key={r.matchId}>
                          <td>{r.skuId}</td>
                          <td>{findObject(r.channelId)?.displayName || r.channelId}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {selectedAnalysisEvent && <span className="tag" style={{ margin: 0 }}>{selectedAnalysisEvent.displayName}</span>}
                              {selectedAnalysisScenario && <span className="tag" style={{ margin: 0 }}>{selectedAnalysisScenario.displayName}</span>}
                              {!selectedAnalysisEvent && !selectedAnalysisScenario && <span style={{ color: 'var(--muted-foreground)' }}>未选择</span>}
                            </div>
                          </td>
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
              {activeTab === 'threeAudience' && renderThreeAudience()}
            </>
          ) : null}
        </div>
      </div>
      {renderImportModal()}
      {renderAnalysis()}
    </div>
  );
}
