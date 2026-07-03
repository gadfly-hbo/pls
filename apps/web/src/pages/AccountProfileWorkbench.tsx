import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { AccountProfile, AccountMatchResult } from '../types';
import { translateTag } from '../utils/translate';

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
    <div className="dashboard-grid" style={{ gap: '24px' }}>
      
      {/* Sidebar: Entity List */}
      <div className="card" style={{ padding: '20px', margin: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>实体列表</h2>
        <div className="form-item" style={{ marginBottom: 16 }}>
          <input 
            type="text" 
            className="form-control" 
            placeholder="搜索店铺 / 账号 / 门店..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {listLoading ? (
            <div style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: 20 }}>加载中...</div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{ color: 'var(--muted-foreground)', textAlign: 'center', padding: 20 }}>暂无匹配的实体</div>
          ) : (
            Object.entries(groupedAccounts).map(([platform, accs]) => (
              <div key={platform} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase' }}>
                  {platform === 'content_ecommerce' ? '内容电商' : platform === 'traditional_ecommerce' ? '传统电商' : platform === 'social_ecommerce' ? '社交电商' : platform}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {accs.map(acc => (
                    <div 
                      key={acc.accountId}
                      onClick={() => setSelectedAccountId(acc.accountId)}
                      style={{ 
                        padding: '10px 12px', 
                        borderRadius: 8, 
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: selectedAccountId === acc.accountId ? 'var(--primary)' : 'var(--border)',
                        background: selectedAccountId === acc.accountId ? 'var(--accent)' : 'var(--card)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--foreground)' }}>{acc.accountName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, overflowWrap: 'anywhere' }}>
                        {acc.sourceEntityKey || acc.accountId}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span>{acc.accountType}</span>
                        {acc.qualityFlags && acc.qualityFlags.includes('低置信度') && (
                          <span style={{ color: 'var(--warning)' }}>数据不足</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {error ? (
          <div className="alert alert-warning">{error}</div>
        ) : !selectedAccountId ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            请在左侧选择一个店铺或账号
          </div>
        ) : detailLoading && !accountProfile ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载详情中...</div>
        ) : accountProfile ? (
          <>
            {/* Header Area */}
            <div className="card" style={{ padding: '24px 32px', margin: 0 }}>
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h2 style={{ fontSize: 24, margin: '0 0 8px 0' }}>{accountProfile.accountName}</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="tag" style={{ margin: 0 }}>{accountProfile.accountType}</span>
                    <span className="tag" style={{ margin: 0, background: 'var(--background)' }}>
                      ID: {accountProfile.accountId}
                    </span>
                    {accountProfile.qualityFlags?.map(flag => (
                      <span key={flag} className={`tag ${flag.includes('低') || flag.includes('不足') ? 'tag-orange' : 'tag-green'}`} style={{ margin: 0 }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Tabs */}
                <div style={{ display: 'flex', background: 'var(--secondary)', padding: 4, borderRadius: 8 }}>
                  <button 
                    onClick={() => setActiveTab('analysis')}
                    style={{
                      padding: '6px 16px', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                      background: activeTab === 'analysis' ? 'var(--card)' : 'transparent',
                      color: activeTab === 'analysis' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: activeTab === 'analysis' ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    人群画像分析
                  </button>
                  <button 
                    onClick={() => setActiveTab('decision')}
                    style={{
                      padding: '6px 16px', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                      background: activeTab === 'decision' ? 'var(--card)' : 'transparent',
                      color: activeTab === 'decision' ? 'var(--foreground)' : 'var(--muted-foreground)',
                      boxShadow: activeTab === 'decision' ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    号货匹配决策
                  </button>
                </div>
              </div>
            </div>

            {hasLowConfidence && (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                注意：当前账号/店铺有效样本量不足（样本量：{accountProfile.sampleSize.toLocaleString()}），人群画像和匹配建议可能存在偏差，仅供参考。
              </div>
            )}

            {/* Content Area */}
            {activeTab === 'analysis' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Metrics */}
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-title">有效数据样本量 <span>ⓘ</span></div>
                    <div className="metric-value">{accountProfile.sampleSize.toLocaleString()}</div>
                    <div className="metric-sub">
                      <span>统计窗口</span>
                      <span>{accountProfile.timeWindow}</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-title">粉丝/关注量 <span>ⓘ</span></div>
                    <div className="metric-value">{accountProfile.performanceIndex.followerCount.toLocaleString()}</div>
                    <div className="metric-sub">
                      <span>活跃度</span>
                      <span className="trend-up">较高</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-title">综合互动率 <span>ⓘ</span></div>
                    <div className="metric-value">{(accountProfile.performanceIndex.engagementRate * 100).toFixed(2)}%</div>
                    <div className="metric-sub">
                      <span>高于同级均值</span>
                      <span className="trend-up">▲ 1.5%</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-title">成交转化率 <span>ⓘ</span></div>
                    <div className="metric-value">{(accountProfile.performanceIndex.conversionRate * 100).toFixed(2)}%</div>
                    <div className="metric-sub">
                      <span>平台水位参考</span>
                      <span className="trend-down">▼ 0.2%</span>
                    </div>
                  </div>
                </div>

                {/* Profile Distribution */}
                <div className="card" style={{ padding: 24, margin: 0 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 20 }}>核心画像标签 (Benchmark Tags)</h3>
                  {accountProfile.coreTags.length === 0 ? (
                    <div style={{ color: 'var(--muted-foreground)', padding: 20, textAlign: 'center', background: 'var(--background)', borderRadius: 8 }}>
                      暂无核心画像数据 (Unmapped / Empty)
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {accountProfile.coreTags.map((tag, index) => (
                        <div key={`${tag.tagId}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 500 }}>{translateTag(tag.tagId)}</span>
                          <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 16 }}>{(tag.score * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>触点与互动偏好</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {accountProfile.interactionPreference.length > 0 ? (
                        accountProfile.interactionPreference.map(pref => (
                          <span key={pref} className="tag" style={{ background: 'var(--background)' }}>{pref}</span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>暂无明显偏好数据</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Decision View */}
                <div className="card" style={{ padding: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 500 }}>选择匹配目标商品 (SKU):</div>
                  <input 
                    className="form-control" 
                    style={{ width: 200, height: 36 }}
                    value={skuId}
                    onChange={e => setSkuId(e.target.value)}
                    placeholder="输入 SKU ID"
                  />
                  <button className="btn btn-primary" style={{ height: 36 }} onClick={() => setSkuId(skuId)}>分析匹配度</button>
                  {matchResult && (
                    <button className="btn" style={{ height: 36, marginLeft: 'auto' }} onClick={handleExportCsv}>导出报告</button>
                  )}
                </div>

                {detailLoading && !matchResult ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>分析计算中...</div>
                ) : !matchResult ? (
                  <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>输入商品ID并点击分析</div>
                ) : (
                  <>
                    <div className="metric-grid">
                      <div className="metric-card" style={{ background: 'var(--background)' }}>
                        <div className="metric-title">号货匹配综合得分 <span>ⓘ</span></div>
                        <div className="metric-value" style={{ color: 'var(--primary)', fontSize: 32 }}>
                          {(matchResult.fitScore * 100).toFixed(0)} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted-foreground)' }}>分</span>
                        </div>
                        <div className="metric-sub">
                          <span>算法置信度</span>
                          <span>{(matchResult.fitConfidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 24, margin: 0 }}>
                      <h3 style={{ fontSize: 16, margin: '0 0 16px 0' }}>匹配维度对比</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>匹配维度</th>
                              <th>当前实体特征</th>
                              <th>商品目标人群特征</th>
                              <th style={{ width: 100 }}>对齐状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchResult.comparison.map(comp => (
                              <tr key={comp.dimension}>
                                <td style={{ fontWeight: 500 }}>{comp.dimension}</td>
                                <td>{comp.accountTop1.label}</td>
                                <td>{comp.skuTop1.label}</td>
                                <td>
                                  <span className={`tag ${comp.isAligned ? 'tag-green' : 'tag-red'}`} style={{ margin: 0 }}>
                                    {comp.isAligned ? '吻合' : '偏离'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 24, margin: 0 }}>
                      <h3 style={{ fontSize: 16, margin: '0 0 16px 0' }}>策略调整与优化建议</h3>
                      {matchResult.adjustmentAdvice.length === 0 ? (
                        <div style={{ color: 'var(--muted-foreground)', padding: 40, textAlign: 'center', background: 'var(--background)', borderRadius: 8 }}>
                          当前匹配度极高，暂无优化建议。
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th style={{ width: 200 }}>优化项目</th>
                                <th>行动建议</th>
                                <th style={{ width: 120 }}>状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matchResult.adjustmentAdvice.map(adv => (
                                <tr key={adv.id}>
                                  <td style={{ fontWeight: 500 }}>{adv.item}</td>
                                  <td style={{ color: 'var(--muted-foreground)' }}>{adv.suggestion}</td>
                                  <td>
                                    <span className="tag" style={{ margin: 0 }}>{adv.status}</span>
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
  );
}
