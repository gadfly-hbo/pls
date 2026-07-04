import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { AccountProfile, AccountMatchResult } from '../types';
import { translateTag } from '../utils/translate';

/** Translate platformType to user-friendly Chinese label */
function translatePlatform(platform: string): string {
  switch (platform) {
    case 'content_ecommerce': return '内容电商';
    case 'traditional_ecommerce': return '传统电商';
    case 'social_ecommerce': return '社交电商';
    default: return platform;
  }
}

export default function AccountProfileWorkbench() {
  const [accounts, setAccounts] = useState<AccountProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  
  // Decision View state
  const [skuId, setSkuId] = useState<string>('109326100005');
  const [matchResult, setMatchResult] = useState<AccountMatchResult | null>(null);
  
  const [activeTab, setActiveTab] = useState<'analysis' | 'decision'>('analysis');
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAccounts = async () => {
      setListLoading(true);
      setError(null);
      try {
        const res = await api.getAccountProfiles();
        setAccounts(res.data);
        if (res.data.length > 0) {
          setSelectedAccountId(res.data[0].accountId);
        }
      } catch (err) {
        setError('Failed to load accounts');
        console.error(err);
      } finally {
        setListLoading(false);
      }
    };
    initAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    
    const fetchDetail = async () => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await api.getAccountProfileDetail(selectedAccountId);
        setAccountProfile(res.data);
      } catch (err) {
        setError('Failed to load account profile');
        console.error(err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId || !skuId || activeTab !== 'decision') return;
    
    const fetchDecision = async () => {
      setDetailLoading(true);
      try {
        const accountChannelId = accountProfile?.sourceEntityKey || selectedAccountId;
        const res = await api.getAccountMatch(skuId, accountChannelId);
        setMatchResult(res.data);
      } catch (err) {
        console.error('Failed to load decision match', err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDecision();
  }, [accountProfile?.sourceEntityKey, selectedAccountId, skuId, activeTab]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => 
      acc.accountName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      acc.accountId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.sourceEntityKey?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );
  }, [accounts, searchQuery]);

  // Group by platformType
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, AccountProfile[]> = {};
    filteredAccounts.forEach(acc => {
      const p = acc.platformType || 'unknown';
      if (!groups[p]) groups[p] = [];
      groups[p].push(acc);
    });
    return groups;
  }, [filteredAccounts]);

  const handleExportCsv = () => {
    if (!matchResult) return;
    const header = "skuId,accountId,fitScore,fitConfidence,qualityFlags,generatedAt,advice\n";
    const adviceStr = matchResult.adjustmentAdvice.map(a => `${a.item}: ${a.suggestion}`).join('; ');
    const row = `${matchResult.skuId},${matchResult.accountId},${matchResult.fitScore},${matchResult.fitConfidence},"${matchResult.qualityFlags.join('|')}",${new Date().toISOString()},"${adviceStr}"\n`;
    
    const blob = new Blob([header + row], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `account_decision_${matchResult.skuId}_${matchResult.accountId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasLowConfidence = Boolean(
    accountProfile && (
      accountProfile.qualityFlags?.includes('低置信度') ||
      accountProfile.sampleSize < 1000
    )
  );

  return (
    <div className="account-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">实体与账号画像</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            选择店铺、账号或门店，查看画像分析与匹配建议
          </div>
        </div>
      </div>

      <div className="account-workbench__body dashboard-grid">
        {/* Sidebar: Entity List */}
        <div className="workbench-sidebar">
        <h2 className="workbench-sidebar__title">实体列表</h2>
        <div className="workbench-sidebar__search">
          <input 
            type="text" 
            className="form-control" 
            placeholder="搜索店铺 / 账号 / 门店..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="workbench-sidebar__list">
          {listLoading ? (
            <div className="empty-state">
              <div className="empty-state__title">加载中...</div>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">🔍</div>
              <div className="empty-state__title">暂无匹配的实体</div>
              <div>请前往数据管理导入实体数据</div>
            </div>
          ) : (
            Object.entries(groupedAccounts).map(([platform, accs]) => (
              <div key={platform} className="workbench-sidebar__group">
                <div className="workbench-sidebar__group-label">
                  {translatePlatform(platform)}
                </div>
                <div className="workbench-sidebar__group-items">
                  {accs.map(acc => (
                    <div 
                      key={acc.accountId}
                      className={`entity-list-item${selectedAccountId === acc.accountId ? ' entity-list-item--selected' : ''}`}
                      onClick={() => setSelectedAccountId(acc.accountId)}
                    >
                      <div className="entity-list-item__name">{acc.accountName}</div>
                      <div className="entity-list-item__id">
                        {acc.sourceEntityKey || acc.accountId}
                      </div>
                      <div className="entity-list-item__footer">
                        <span>{acc.accountType}</span>
                        {acc.qualityFlags && acc.qualityFlags.includes('低置信度') && (
                          <span className="status-badge status-badge--warning">数据不足</span>
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

        {/* Main Content: Details and Profile */}
        <div className="workbench-detail">
        {error ? (
          <div className="alert-banner alert-banner--warning">⚠️ {error}</div>
        ) : !selectedAccountId ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <div className="empty-state__icon">👈</div>
            <div className="empty-state__title">请在左侧选择一个店铺或账号</div>
            <div>选择后可查看画像分析和号货匹配决策</div>
          </div>
        ) : detailLoading && !accountProfile ? (
          <div className="empty-state">
            <div className="empty-state__title">加载详情中...</div>
          </div>
        ) : accountProfile ? (
          <>
            {/* PageHeader */}
            <div className="page-header">
              <div className="page-header__info">
                <h2 className="page-header__title">{accountProfile.accountName}</h2>
                <div className="page-header__meta">
                  <span className="tag" style={{ margin: 0 }}>{accountProfile.accountType}</span>
                  <span className="status-badge status-badge--neutral">
                    ID: {accountProfile.accountId}
                  </span>
                  <span className="status-badge status-badge--neutral">
                    样本量: {accountProfile.sampleSize.toLocaleString()}
                  </span>
                  <span className="status-badge status-badge--neutral">
                    {accountProfile.timeWindow}
                  </span>
                  {accountProfile.qualityFlags?.map(flag => (
                    <span 
                      key={flag} 
                      className={`status-badge ${flag.includes('低') || flag.includes('不足') ? 'status-badge--warning' : 'status-badge--success'}`}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* SegmentedControl */}
              <div className="page-header__actions">
                <div className="segmented-control">
                  <button 
                    className={`segmented-control__btn${activeTab === 'analysis' ? ' segmented-control__btn--active' : ''}`}
                    onClick={() => setActiveTab('analysis')}
                  >
                    人群画像分析
                  </button>
                  <button 
                    className={`segmented-control__btn${activeTab === 'decision' ? ' segmented-control__btn--active' : ''}`}
                    onClick={() => setActiveTab('decision')}
                  >
                    号货匹配决策
                  </button>
                </div>
              </div>
            </div>

            {hasLowConfidence && (
              <div className="alert-banner alert-banner--warning">
                ⚠️ 注意：当前账号/店铺有效样本量不足（样本量：{accountProfile.sampleSize.toLocaleString()}），人群画像和匹配建议可能存在偏差，仅供参考。
              </div>
            )}

            {/* Content Area */}
            {activeTab === 'analysis' ? (
              <div className="workbench-detail">
                {/* Metrics */}
                <div className="metric-grid">
                  <div className="metric-card metric-card--compact">
                    <div className="metric-title">有效数据样本量 <span>ⓘ</span></div>
                    <div className="metric-value">{accountProfile.sampleSize.toLocaleString()}</div>
                    <div className="metric-sub">
                      <span>统计窗口</span>
                      <span>{accountProfile.timeWindow}</span>
                    </div>
                  </div>
                  <div className="metric-card metric-card--compact">
                    <div className="metric-title">粉丝/关注量 <span>ⓘ</span></div>
                    <div className="metric-value">{accountProfile.performanceIndex.followerCount.toLocaleString()}</div>
                    <div className="metric-sub">
                      <span>活跃度</span>
                      <span className="trend-up">较高</span>
                    </div>
                  </div>
                  <div className="metric-card metric-card--compact">
                    <div className="metric-title">综合互动率 <span>ⓘ</span></div>
                    <div className="metric-value">{(accountProfile.performanceIndex.engagementRate * 100).toFixed(2)}%</div>
                    <div className="metric-sub">
                      <span>高于同级均值</span>
                      <span className="trend-up">▲ 1.5%</span>
                    </div>
                  </div>
                  <div className="metric-card metric-card--compact">
                    <div className="metric-title">成交转化率 <span>ⓘ</span></div>
                    <div className="metric-value">{(accountProfile.performanceIndex.conversionRate * 100).toFixed(2)}%</div>
                    <div className="metric-sub">
                      <span>平台水位参考</span>
                      <span className="trend-down">▼ 0.2%</span>
                    </div>
                  </div>
                </div>

                {/* Profile Distribution */}
                <div className="panel">
                  <h3 className="panel__title">核心画像标签 (Benchmark Tags)</h3>
                  {accountProfile.coreTags.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state__icon">📊</div>
                      <div className="empty-state__title">暂无核心画像数据</div>
                      <div>可能是 Unmapped 或数据尚未导入</div>
                    </div>
                  ) : (
                    <div className="tag-grid">
                      {accountProfile.coreTags.map((tag, index) => (
                        <div key={`${tag.tagId}-${index}`} className="tag-grid__item">
                          <span className="tag-grid__label">{translateTag(tag.tagId)}</span>
                          <span className="tag-grid__score">{(tag.score * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <div className="panel__title" style={{ fontSize: 13 }}>触点与互动偏好</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {accountProfile.interactionPreference.length > 0 ? (
                        accountProfile.interactionPreference.map(pref => (
                          <span key={pref} className="tag" style={{ background: 'var(--background)', margin: 0 }}>{pref}</span>
                        ))
                      ) : (
                        <span className="empty-state" style={{ padding: '10px 16px', fontSize: 13 }}>暂无明显偏好数据</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="workbench-detail">
                {/* Decision View Toolbar */}
                <div className="toolbar">
                  <div className="toolbar__label">选择匹配目标商品 (SKU):</div>
                  <input 
                    className="form-control" 
                    style={{ width: 180, flex: '0 1 180px' }}
                    value={skuId}
                    onChange={e => setSkuId(e.target.value)}
                    placeholder="输入 SKU ID"
                  />
                  <button className="btn btn-primary" onClick={() => setSkuId(skuId)}>分析匹配度</button>
                  <div className="toolbar__spacer" />
                  {matchResult && (
                    <button className="btn" onClick={handleExportCsv}>导出报告</button>
                  )}
                </div>

                {detailLoading && !matchResult ? (
                  <div className="empty-state">
                    <div className="empty-state__title">分析计算中...</div>
                  </div>
                ) : !matchResult ? (
                  <div className="empty-state" style={{ minHeight: 160 }}>
                    <div className="empty-state__icon">📋</div>
                    <div className="empty-state__title">输入商品ID并点击分析</div>
                    <div>系统将计算号货匹配度并生成诊断报告</div>
                  </div>
                ) : (
                  <>
                    <div className="metric-grid">
                      <div className="metric-card" style={{ background: 'var(--background)' }}>
                        <div className="metric-title">号货匹配综合得分 <span>ⓘ</span></div>
                        <div className="metric-value" style={{ color: 'var(--primary)' }}>
                          {(matchResult.fitScore * 100).toFixed(0)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted-foreground)' }}>分</span>
                        </div>
                        <div className="metric-sub">
                          <span>算法置信度</span>
                          <span>{(matchResult.fitConfidence * 100).toFixed(0)}%</span>
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
                            {matchResult.comparison.map(comp => (
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
                      {matchResult.adjustmentAdvice.length === 0 ? (
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
                              {matchResult.adjustmentAdvice.map(adv => (
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
            )}
          </>
        ) : null}
        </div>
      </div>
    </div>
  );
}
