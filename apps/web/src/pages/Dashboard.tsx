import { useEffect, useState } from 'react';
import {
  SinglePortraitBatchResults,
  SinglePortraitBatchUpload,
  SinglePortraitForm,
  SinglePortraitModelInfo,
  SinglePortraitResult,
} from '../components/SingleProductPortrait';
import { api } from '../services/api';
import type {
  SingleProductPortraitBatchExecute,
  SingleProductPortraitBatchPreview,
  SingleProductPortraitInput,
  SingleProductPortraitMetadata,
  SingleProductPortraitPrediction,
  SimulatedMarketPrefill,
} from '../types';

const EMPTY_SINGLE_PORTRAIT_INPUT: SingleProductPortraitInput = {
  skuId: '',
  fitType: '',
  fabric: '',
  fab: '',
};

interface Props {
  currentSku: string | null;
  setCurrentSku: (s: string) => void;
  prediction: SingleProductPortraitPrediction | null;
  setPrediction: (p: SingleProductPortraitPrediction | null) => void;
  goToHeatmap: () => void;
  goToSimulatedMarket: (prefill: SimulatedMarketPrefill) => void;
}

export default function Dashboard(_props: Props) {
  const [metadata, setMetadata] = useState<SingleProductPortraitMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [singleInput, setSingleInput] = useState<SingleProductPortraitInput>(EMPTY_SINGLE_PORTRAIT_INPUT);
  const [singlePrediction, setSinglePrediction] = useState<SingleProductPortraitPrediction | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchPreview, setBatchPreview] = useState<SingleProductPortraitBatchPreview | null>(null);
  const [batchResult, setBatchResult] = useState<SingleProductPortraitBatchExecute | null>(null);
  const [batchPreviewing, setBatchPreviewing] = useState(false);
  const [batchExecuting, setBatchExecuting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getSingleProductPortraitMetadata()
      .then((res) => {
        if (cancelled) return;
        setMetadata(res.data);
        if (res.data.modelAvailable && res.data.fitTypes.length > 0) {
          const firstFitType = res.data.fitTypes[0] ?? '';
          setSingleInput((current) => current.fitType ? current : { ...current, fitType: firstFitType });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMetadataError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [modelInfoCollapsed, setModelInfoCollapsed] = useState(false);

  const modelDisabled = !metadata || !metadata.modelAvailable;
  const unavailableMessage = metadata && !metadata.modelAvailable ? metadata.error.message : null;

  const submitSingle = async () => {
    setSingleLoading(true);
    setSingleError(null);
    try {
      const res = await api.predictSingleProductPortrait(singleInput);
      setSinglePrediction(res.data.prediction);
    } catch (error) {
      setSingleError(error instanceof Error ? error.message : String(error));
    } finally {
      setSingleLoading(false);
    }
  };

  const previewBatch = async () => {
    if (!batchFile) return;
    setBatchPreviewing(true);
    setBatchError(null);
    setBatchResult(null);
    try {
      const res = await api.previewSingleProductPortraitBatch(batchFile);
      setBatchPreview(res.data);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchPreviewing(false);
    }
  };

  const executeBatch = async () => {
    if (!batchFile) return;
    setBatchExecuting(true);
    setBatchError(null);
    try {
      const res = await api.executeSingleProductPortraitBatch(batchFile);
      setBatchResult(res.data);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchExecuting(false);
    }
  };

  return (
    <div className="prediction-workbench single-portrait-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">新品预测</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            基于版型、面料和 FAB 生成单品画像预测，并展示模型风险边界。
          </div>
        </div>
      </div>

      <section className="panel single-portrait-hero">
        <div>
          <h3 className="panel__title">单品画像预测</h3>
          <p className="single-portrait-muted">支持单款预测、批量 preview、批量 execute、风险说明和结果下载；不写入 prediction 表，不触发人货匹配。</p>
        </div>
        <div className="segmented-control" role="tablist" aria-label="单品画像预测模式">
          <button type="button" className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>单款预测</button>
          <button type="button" className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>批量预测</button>
        </div>
      </section>

      {metadataError && <div className="alert-banner alert-banner--error">metadata 加载失败：{metadataError}</div>}
      {unavailableMessage && <div className="alert-banner alert-banner--warning">{unavailableMessage}</div>}

      <div className={`single-portrait-layout ${modelInfoCollapsed ? 'single-portrait-layout--model-collapsed' : ''}`}>
        <div className="single-portrait-main">
          {mode === 'single' ? (
            <>
              <SinglePortraitForm
                metadata={metadata}
                value={singleInput}
                disabled={modelDisabled}
                loading={singleLoading}
                error={singleError}
                onChange={setSingleInput}
                onSubmit={submitSingle}
              />
              {singlePrediction ? <SinglePortraitResult prediction={singlePrediction} onClear={() => setSinglePrediction(null)} onSendToSimulatedMarket={_props.goToSimulatedMarket} /> : (
                <section className="panel empty-state" style={{ minHeight: 240 }}>
                  <div className="empty-state__title">暂无单款画像结果</div>
                  <div>填写单款信息后点击“预测单款画像”。</div>
                </section>
              )}
            </>
          ) : (
            <>
              <SinglePortraitBatchUpload
                metadata={metadata}
                file={batchFile}
                preview={batchPreview}
                disabled={modelDisabled}
                previewing={batchPreviewing}
                executing={batchExecuting}
                error={batchError}
                onFileChange={(file) => {
                  setBatchFile(file);
                  setBatchPreview(null);
                  setBatchResult(null);
                }}
                onPreview={previewBatch}
                onExecute={executeBatch}
              />
              {batchResult && <SinglePortraitBatchResults batch={batchResult} onClear={() => setBatchResult(null)} />}
            </>
          )}
        </div>
        <aside className={`single-portrait-side ${modelInfoCollapsed ? 'single-portrait-side--collapsed' : ''}`}>
          <SinglePortraitModelInfo
            metadata={metadata}
            collapsed={modelInfoCollapsed}
            onToggleCollapse={() => setModelInfoCollapsed((current) => !current)}
          />
        </aside>
      </div>
    </div>
  );
}
