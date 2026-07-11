import { useId, useState } from 'react';
import type {
  PortraitEvidence,
  PortraitInputIssue,
  SingleProductPortraitBatchExecute,
  SingleProductPortraitBatchPreview,
  SingleProductPortraitBatchResultRow,
  SingleProductPortraitInput,
  SingleProductPortraitMetadata,
  SingleProductPortraitPrediction,
  SimulatedMarketPrefill,
} from '../types';

const LOW_STABILITY_DIMENSIONS = new Set(['城市等级', '八大消费群体']);

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadText(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function issueRows(issues: PortraitInputIssue[]): string {
  const header = ['rowNumber', 'skuId', 'field', 'code', 'message', 'rawValue'];
  const lines = issues.map((issue) => [issue.rowNumber ?? '', issue.skuId ?? '', issue.field ?? '', issue.code, issue.message, issue.rawValue ?? ''].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n');
}

function predictionRows(results: SingleProductPortraitBatchResultRow[]): string {
  const header = ['rowNumber', 'skuId', 'dimension', 'rank', 'label', 'share', 'confidence', 'sourceFields', 'evidenceKeywords', 'riskFlags'];
  const lines = results.flatMap((result) =>
    result.prediction.dimensionSummaries.flatMap((dimension) =>
      dimension.topLabels.map((label, index) => {
        const evidence = result.prediction.explanationSources.filter((item) => item.targetLabelType === dimension.labelType && item.targetLabel === label.label);
        const sourceFields = [...new Set(evidence.map((item) => item.sourceField))].join('|');
        const keywords = evidence.map((item) => item.sourceValue).filter(Boolean).join('|');
        return [
          result.rowNumber,
          result.skuId,
          dimension.labelType,
          index + 1,
          label.label,
          label.share ?? '',
          label.confidence,
          sourceFields,
          keywords,
          result.prediction.riskFlags.join('|'),
        ].map(csvCell).join(',');
      }),
    ),
  );
  return [header.join(','), ...lines].join('\n');
}

function buildSinglePortraitPrefill(prediction: SingleProductPortraitPrediction): SimulatedMarketPrefill {
  const topLabels = prediction.dimensionSummaries
    .map((dimension) => {
      const top = dimension.topLabels[0];
      if (!top) return `${dimension.labelType}: -`;
      const shareText = top.share !== null && top.share !== undefined ? `${(top.share * 100).toFixed(1)}%` : '-';
      return `${dimension.labelType}: ${top.label} (${shareText})`;
    })
    .join('；');

  const evidence = prediction.explanationSources
    .slice(0, 3)
    .map((item) => `${item.sourceField}=${item.sourceValue}; ${item.rationale}`)
    .join('\n');

  const strategyText = [
    `SKU: ${prediction.skuId}`,
    `模型版本: ${prediction.modelVersion}`,
    `风险标记: ${prediction.riskFlags.join('、') || '无'}`,
    '',
    '画像摘要：',
    topLabels,
    '',
    '关键 evidence：',
    evidence || '暂无明确驱动证据',
  ].join('\n');

  return {
    sourceType: 'single_product_portrait',
    sourceRef: { id: prediction.skuId, type: 'single_product_portrait' },
    strategyText,
  };
}

function topLabel(prediction: SingleProductPortraitPrediction, dimension: string): string {
  return prediction.dimensionSummaries.find((item) => item.labelType === dimension)?.topLabels[0]?.label ?? '-';
}

function evidenceForDimension(prediction: SingleProductPortraitPrediction, dimension: string): PortraitEvidence[] {
  return prediction.explanationSources.filter((item) => item.targetLabelType === dimension);
}

export function SinglePortraitForm({
  metadata,
  value,
  disabled,
  loading,
  error,
  onChange,
  onSubmit,
}: {
  metadata: SingleProductPortraitMetadata | null;
  value: SingleProductPortraitInput;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: SingleProductPortraitInput) => void;
  onSubmit: () => void;
}) {
  const fitTypes = metadata?.modelAvailable ? metadata.fitTypes : [];
  const fillExample = () => {
    onChange({
      skuId: 'NEW_SINGLE_001',
      fitType: fitTypes[0] ?? '',
      fabric: '全棉针织',
      fab: '通勤基础款T恤，舒适亲肤，适合日常上班和周末出行。',
    });
  };

  return (
    <section className="panel single-portrait-card">
      <div className="single-portrait-card__header">
        <div>
          <h3 className="panel__title">单款预测</h3>
          <p className="single-portrait-muted">输入款号、版型、面料和 FAB，直接调用专用预测 API。</p>
        </div>
        <button type="button" className="btn" onClick={fillExample} disabled={disabled || fitTypes.length === 0}>填入示例</button>
      </div>
      <form
        className="single-portrait-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="form-item">
          <label htmlFor="single-sku-id">款号</label>
          <input id="single-sku-id" className="form-control" value={value.skuId} onChange={(event) => onChange({ ...value, skuId: event.target.value })} required disabled={disabled || loading} />
        </div>
        <div className="form-item">
          <label htmlFor="single-fit-type">版型</label>
          <select id="single-fit-type" className="form-control" value={value.fitType} onChange={(event) => onChange({ ...value, fitType: event.target.value })} required disabled={disabled || loading || fitTypes.length === 0}>
            <option value="">请选择版型</option>
            {fitTypes.map((fitType) => <option key={fitType} value={fitType}>{fitType}</option>)}
          </select>
        </div>
        <div className="form-item">
          <label htmlFor="single-fabric">面料</label>
          <input id="single-fabric" className="form-control" value={value.fabric} onChange={(event) => onChange({ ...value, fabric: event.target.value })} required disabled={disabled || loading} />
        </div>
        <div className="form-item single-portrait-form__wide">
          <label htmlFor="single-fab">FAB</label>
          <textarea id="single-fab" className="form-control" value={value.fab} onChange={(event) => onChange({ ...value, fab: event.target.value })} required disabled={disabled || loading} rows={4} />
        </div>
        <button type="submit" className="btn btn-primary single-portrait-form__wide" disabled={disabled || loading}>{loading ? '预测中...' : '预测单款画像'}</button>
      </form>
      {error && <div className="alert-banner alert-banner--error">{error}</div>}
    </section>
  );
}

export function SinglePortraitBatchUpload({
  metadata,
  file,
  preview,
  disabled,
  previewing,
  executing,
  error,
  onFileChange,
  onPreview,
  onExecute,
}: {
  metadata: SingleProductPortraitMetadata | null;
  file: File | null;
  preview: SingleProductPortraitBatchPreview | null;
  disabled: boolean;
  previewing: boolean;
  executing: boolean;
  error: string | null;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
  onExecute: () => void;
}) {
  const inputId = useId();
  const canExecute = Boolean(preview && preview.validRows > 0 && preview.fileErrors.length === 0);
  const executeLabel = preview && preview.invalidRows > 0 ? '预测有效行' : '执行批量预测';
  const downloadTemplate = () => {
    const columns = metadata?.requiredColumns ?? ['款号', '版型', '面料', 'FAB'];
    downloadText('single-product-portrait-template.csv', 'text/csv;charset=utf-8', `${columns.join(',')}\n`);
  };

  return (
    <section className="panel single-portrait-card">
      <div className="single-portrait-card__header">
        <div>
          <h3 className="panel__title">批量预测</h3>
          <p className="single-portrait-muted">上传 CSV 或 XLSX 给后端校验；浏览器端不解析文件内容。</p>
        </div>
        <button type="button" className="btn" onClick={downloadTemplate} disabled={!metadata}>下载模板</button>
      </div>
      <div className="single-portrait-batch-actions">
        <label className="single-portrait-file" htmlFor={inputId}>
          <span>{file ? file.name : '选择 .csv 或 .xlsx 文件'}</span>
          <input id={inputId} type="file" accept=".csv,.xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} disabled={disabled || previewing || executing} />
        </label>
        <button type="button" className="btn" onClick={onPreview} disabled={disabled || !file || previewing}>{previewing ? '校验中...' : '校验批量文件'}</button>
        <button type="button" className="btn btn-primary" onClick={onExecute} disabled={disabled || !canExecute || executing}>{executing ? '执行中...' : executeLabel}</button>
      </div>
      {error && <div className="alert-banner alert-banner--error">{error}</div>}
      {preview && <BatchPreviewSummary preview={preview} />}
    </section>
  );
}

function BatchPreviewSummary({ preview }: { preview: SingleProductPortraitBatchPreview }) {
  return (
    <div className="single-portrait-preview">
      <div className="metric-grid">
        <div className="metric-card metric-card--compact"><div className="metric-title">总行数</div><div className="metric-value">{preview.totalRows}</div></div>
        <div className="metric-card metric-card--compact"><div className="metric-title">有效行</div><div className="metric-value">{preview.validRows}</div></div>
        <div className="metric-card metric-card--compact"><div className="metric-title">失败行</div><div className="metric-value">{preview.invalidRows}</div></div>
        <div className="metric-card metric-card--compact"><div className="metric-title">Warnings</div><div className="metric-value">{preview.warnings.length}</div></div>
      </div>
      <IssueList title="文件级错误" issues={preview.fileErrors} />
      <IssueList title="行级错误" issues={preview.rowErrors} />
      <IssueList title="Warnings" issues={preview.warnings} />
      <div className="single-portrait-muted">额外列：{preview.extraColumns.length > 0 ? preview.extraColumns.join('、') : '无'}</div>
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: PortraitInputIssue[] }) {
  if (issues.length === 0) return <div className="single-portrait-muted">{title}：无</div>;
  return (
    <div className="single-portrait-issue-list">
      <strong>{title}</strong>
      {issues.map((issue, index) => (
        <div key={`${issue.code}-${issue.rowNumber ?? 'file'}-${index}`} className="single-portrait-issue">
          {issue.rowNumber ? `第 ${issue.rowNumber} 行 ` : ''}{issue.code}：{issue.message}{issue.rawValue ? `（${issue.rawValue}）` : ''}
        </div>
      ))}
    </div>
  );
}

export function SinglePortraitResult({ prediction, title = '单款画像结果', onClear, onSendToSimulatedMarket }: { prediction: SingleProductPortraitPrediction; title?: string; onClear?: () => void; onSendToSimulatedMarket?: (prefill: SimulatedMarketPrefill) => void; }) {
  const handleSendToSimulatedMarket = () => {
    if (!onSendToSimulatedMarket) return;
    onSendToSimulatedMarket(buildSinglePortraitPrefill(prediction));
  };

  return (
    <section className="panel single-portrait-result">
      <div className="single-portrait-card__header">
        <div>
          <h3 className="panel__title">{title}</h3>
          <p className="single-portrait-muted">款号：{prediction.skuId} · 生成时间：{formatDate(prediction.generatedAt)}</p>
        </div>
        <div className="single-portrait-result-actions">
          <span className="status-badge status-badge--neutral">{prediction.modelVersion}</span>
          {onSendToSimulatedMarket && (
            <button type="button" className="btn" onClick={handleSendToSimulatedMarket}>
              送入模拟市场
            </button>
          )}
          {onClear && <button type="button" className="btn" onClick={onClear}>清空结果</button>}
        </div>
      </div>
      {prediction.riskFlags.length > 0 && (
        <div className="alert-banner alert-banner--warning">当前模型只完成小样本 LOO 验证，不承诺新品上线后的泛化表现。风险标记：{prediction.riskFlags.join('、')}</div>
      )}
      <div className="single-portrait-dimensions">
        {prediction.dimensionSummaries.map((dimension) => (
          <div key={dimension.labelType} className="single-portrait-dimension">
            <div className="single-portrait-dimension__title">
              <span>{dimension.labelType}</span>
              {LOW_STABILITY_DIMENSIONS.has(dimension.labelType) && <span className="status-badge status-badge--warning">低稳定性</span>}
            </div>
            <div className="score-bar-list">
              {dimension.topLabels.slice(0, 3).map((label) => (
                <div key={label.label} className="score-bar">
                  <span className="score-bar__label">{label.label}</span>
                  <div className="score-bar__track"><div className="score-bar__fill" style={{ width: formatPercent(label.share) }} /></div>
                  <span className="score-bar__value">{formatPercent(label.share)}</span>
                </div>
              ))}
            </div>
            <div className="single-portrait-evidence">
              {evidenceForDimension(prediction, dimension.labelType).slice(0, 2).map((item, index) => (
                <div key={`${item.ruleId}-${index}`}>{item.sourceField}：{item.sourceValue || '暂无明确驱动证据'} · {item.rationale}</div>
              ))}
              {evidenceForDimension(prediction, dimension.labelType).length === 0 && <div>暂无明确驱动证据</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SinglePortraitBatchResults({ batch, onClear }: { batch: SingleProductPortraitBatchExecute; onClear?: () => void }) {
  const [selected, setSelected] = useState<SingleProductPortraitBatchResultRow | null>(batch.results[0] ?? null);
  const allIssues = [...batch.rowErrors, ...batch.warnings];
  return (
    <section className="panel single-portrait-result">
      <div className="single-portrait-card__header">
        <div>
          <h3 className="panel__title">批量画像结果</h3>
          <p className="single-portrait-muted">成功 {batch.successCount} 行，失败 {batch.failureCount} 行，Warnings {batch.warningCount} 条。</p>
        </div>
        <div className="single-portrait-downloads">
          <button type="button" className="btn" onClick={() => downloadText('single-product-portrait-results.csv', 'text/csv;charset=utf-8', predictionRows(batch.results))}>预测结果 CSV</button>
          <button type="button" className="btn" onClick={() => downloadText('single-product-portrait-errors.csv', 'text/csv;charset=utf-8', issueRows(allIssues))}>错误报告 CSV</button>
          <button type="button" className="btn" onClick={() => downloadText('single-product-portrait-full.json', 'application/json;charset=utf-8', JSON.stringify(batch, null, 2))}>完整 JSON</button>
          {onClear && <button type="button" className="btn" onClick={onClear}>清空结果</button>}
        </div>
      </div>
      <div className="data-table-wrapper">
        <table className="data-table single-portrait-table">
          <thead>
            <tr>
              <th>款号</th>
              <th>预测状态</th>
              <th>Top 性别</th>
              <th>Top 年龄</th>
              <th>Top 消费能力</th>
              <th>Top 城市等级</th>
              <th>Top 消费群体</th>
              <th>Top 人生阶段</th>
              <th>风险摘要</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batch.results.map((row) => (
              <tr key={`${row.rowNumber}-${row.skuId}`}>
                <td>{row.skuId}</td>
                <td>成功</td>
                <td>{topLabel(row.prediction, '预测性别')}</td>
                <td>{topLabel(row.prediction, '预测年龄段')}</td>
                <td>{topLabel(row.prediction, '预测消费能力')}</td>
                <td>{topLabel(row.prediction, '城市等级')}</td>
                <td>{topLabel(row.prediction, '八大消费群体')}</td>
                <td>{topLabel(row.prediction, '预测人生阶段')}</td>
                <td>{row.prediction.riskFlags.slice(0, 2).join('、')}</td>
                <td><button type="button" className="btn" onClick={() => setSelected(row)}>查看详情</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <SinglePortraitResult prediction={selected.prediction} title={`批量画像详情：${selected.skuId}`} />}
    </section>
  );
}

export function SinglePortraitModelInfo({
  metadata,
  collapsed,
  onToggleCollapse,
}: {
  metadata: SingleProductPortraitMetadata | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  if (!metadata) {
    return (
      <section className="panel single-portrait-model-info">
        <div className="single-portrait-model-info__header">
          <h3 className="panel__title">模型说明</h3>
          <button type="button" className="btn" onClick={onToggleCollapse}>{collapsed ? '展开' : '收起'}</button>
        </div>
        <p className="single-portrait-muted">正在加载 metadata...</p>
      </section>
    );
  }
  if (!metadata.modelAvailable) {
    return (
      <section className="panel single-portrait-model-info">
        <div className="single-portrait-model-info__header">
          <h3 className="panel__title">模型说明</h3>
          <button type="button" className="btn" onClick={onToggleCollapse}>{collapsed ? '展开' : '收起'}</button>
        </div>
        <div className="alert-banner alert-banner--warning">{metadata.error.message}</div>
      </section>
    );
  }
  if (collapsed) {
    return (
      <section className="panel single-portrait-model-info single-portrait-model-info--collapsed">
        <h3 className="panel__title single-portrait-model-info__collapsed-title">模型说明</h3>
        <button type="button" className="btn single-portrait-model-info__expand" onClick={onToggleCollapse} title="展开模型说明">
          展开模型说明
        </button>
      </section>
    );
  }
  return (
    <section className="panel single-portrait-model-info">
      <div className="single-portrait-model-info__header">
        <h3 className="panel__title">模型说明</h3>
        <button type="button" className="btn" onClick={onToggleCollapse}>收起模型说明</button>
      </div>
      <div className="single-portrait-model-grid">
        <div className="single-portrait-model-grid__item">
          <strong className="single-portrait-model-grid__label">modelVersion</strong>
          <span className="single-portrait-model-grid__value">{metadata.modelVersion}</span>
        </div>
        <div className="single-portrait-model-grid__item">
          <strong className="single-portrait-model-grid__label">sampleCount</strong>
          <span className="single-portrait-model-grid__value">{metadata.sampleCount}</span>
        </div>
        <div className="single-portrait-model-grid__item">
          <strong className="single-portrait-model-grid__label">trainedAt/generatedAt</strong>
          <span className="single-portrait-model-grid__value">{formatDate(metadata.trainedAt)}</span>
        </div>
        <div className="single-portrait-model-grid__item">
          <strong className="single-portrait-model-grid__label">支持版型</strong>
          <span className="single-portrait-model-grid__value">{metadata.fitTypes.join('、') || '-'}</span>
        </div>
      </div>
      <div className="single-portrait-muted">risk flags：{metadata.riskFlags.join('、')}</div>
      <div className="data-table-wrapper">
        <table className="data-table single-portrait-table">
          <thead><tr><th>维度</th><th>LOO Top1</th><th>LOO Top3</th></tr></thead>
          <tbody>
            {metadata.metricsSummary.map((metric) => (
              <tr key={metric.labelType}><td>{metric.labelType}</td><td>{formatPercent(metric.top1Overlap)}</td><td>{formatPercent(metric.top3Overlap)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
