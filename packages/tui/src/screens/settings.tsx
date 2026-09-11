import { Box, Text, useInput, useStdout } from 'ink';
import { useMemo, useRef, useState } from 'react';
import { PromptInput } from '../components/prompt-input.js';
import {
  getEmbeddingMetadata,
  getWorkerStatus,
  estimateMigrationImpact,
  migrateEmbeddings,
  validateCloudWorker,
  verifyProviderMatchesDb,
  getUserSettings,
  resetThreshold,
  CloudflareProvider,
  LocalProvider,
  LOCAL_MODELS,
  type AbsoluteDatabase,
  type EmbeddingProvider,
  type WorkerMode,
  type WorkerStatus,
  type MigrationImpact,
} from '@absolute/core';
import { loadConfig, saveConfig } from '../lib/config.js';
import { theme } from '../styles/theme.js';

export interface SettingsScreenProps {
  db: AbsoluteDatabase;
  onBack: () => void;
  onConfigChanged: () => void;
  /** Vertical space reserved above the screen by an overlay. */
  overlayHeight?: number;
}

interface ConfiguredEmbedding {
  mode: WorkerMode;
  modelId: string | null;
  dimensions: number | null;
}

function configuredEmbedding(config: ReturnType<typeof loadConfig>): ConfiguredEmbedding {
  const provider = config.memory?.embeddingProvider;
  if (provider === 'local') {
    const modelId = config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';
    return {
      mode: 'local',
      modelId: `local:${modelId}`,
      dimensions: config.memory?.embeddingDimensions ?? LOCAL_MODELS[modelId] ?? 768,
    };
  }
  if (provider === 'cloudflare') {
    return {
      mode: 'cloud',
      modelId: config.memory?.embeddingModelId ?? null,
      dimensions: config.memory?.embeddingDimensions ?? null,
    };
  }
  return { mode: 'none', modelId: null, dimensions: null };
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'prompt'; title: string }
  | { kind: 'confirm'; text: string }
  | { kind: 'busy'; title: string };

export function SettingsScreen({ db, onBack, onConfigChanged, overlayHeight = 0 }: SettingsScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const rows = Math.max(6, (stdout.rows > 0 ? stdout.rows : 24) - overlayHeight);

  const [refreshKey, setRefreshKey] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [promptValue, setPromptValue] = useState('');
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const promptActionRef = useRef<(value: string) => void>(() => {});
  const pendingTaskRef = useRef<(() => Promise<void>) | null>(null);

  const info = useMemo(() => {
    const config = loadConfig();
    const configured = configuredEmbedding(config);
    const status = getWorkerStatus(db.db, configured);
    const settingsRow = getUserSettings(db.db);
    const meta = getEmbeddingMetadata(db.db);
    return { config, configured, status, settingsRow, meta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, refreshKey]);

  const startCloud = (url: string, token: string): void => {
    setPhase({ kind: 'busy', title: 'Probing embedding worker…' });
    void (async () => {
      const probe = await validateCloudWorker(url, {
        apiToken: token || undefined,
        timeoutMs: 8000,
      });
      if (!probe.ok) {
        setNotice(`Probe failed: ${probe.error}. No changes were made.`);
        setPhase({ kind: 'idle' });
        return;
      }
      const provider = new CloudflareProvider({
        workerUrl: url,
        apiToken: token || undefined,
        modelId: probe.modelId,
        dimensions: probe.dimensions,
      });
      setPhase({ kind: 'busy', title: 'Estimating migration…' });
      await stageSwitch(provider, (mem) =>
        mem === undefined
          ? { embeddingProvider: 'cloudflare' as const, embeddingModelId: provider.modelId.replace(/^cloudflare:/, ''), embeddingDimensions: provider.dimensions, embeddingWorkerUrl: url }
          : {
              ...mem,
              embeddingProvider: 'cloudflare' as const,
              embeddingModelId: provider.modelId.replace(/^cloudflare:/, ''),
              embeddingDimensions: provider.dimensions,
              embeddingWorkerUrl: url,
            }
      );
    })();
  };

  const onUrlSubmit = (value: string): void => {
    const url = value.trim();
    if (!url) {
      setNotice('A worker URL is required to switch. Cancelled.');
      setPhase({ kind: 'idle' });
      return;
    }
    setPhase({ kind: 'prompt', title: 'Worker API token (Bearer, optional):' });
    promptActionRef.current = (token) => startCloud(url, token.trim());
  };

  const startLocal = (): void => {
    setPhase({ kind: 'busy', title: 'Preparing local embedding model…' });
    void (async () => {
      const config = loadConfig();
      const modelId = config.memory?.embeddingModelId ?? 'bge-base-en-v1.5';
      const cacheDir = config.memory?.embeddingCacheDir;
      const known = LOCAL_MODELS[modelId];
      let provider: LocalProvider;
      if (known !== undefined) {
        provider = new LocalProvider({ modelId, dimensions: known, cacheDir });
      } else {
        const probe = await new LocalProvider({ modelId, cacheDir }).probe();
        if (!probe.ok) {
          setNotice(`Local probe failed: ${probe.error}. No changes were made.`);
          setPhase({ kind: 'idle' });
          return;
        }
        provider = new LocalProvider({ modelId, dimensions: probe.dimensions, cacheDir });
      }
      setPhase({ kind: 'busy', title: 'Estimating migration…' });
      await stageSwitch(provider, (mem) => ({
        ...(mem ?? {}),
        embeddingProvider: 'local' as const,
        embeddingModelId: provider.modelId.replace(/^local:/, ''),
        embeddingDimensions: provider.dimensions,
      }));
    })();
  };

  const stageSwitch = async (
    provider: EmbeddingProvider,
    applyFn: (mem: ReturnType<typeof loadConfig>['memory']) => ReturnType<typeof loadConfig>['memory'] | undefined
  ): Promise<void> => {
    const check = verifyProviderMatchesDb(db.db, provider);
    if (!check.ok) {
      setNotice(`Cannot switch: ${check.error}`);
      setPhase({ kind: 'idle' });
      return;
    }

    const impact = estimateMigrationImpact(db.db, provider);
    const applyConfig = (): void => {
      const current = loadConfig();
      saveConfig({ ...current, memory: applyFn(current.memory ?? {}) ?? {} });
    };

    if (!check.changed) {
      applyConfig();
      setNotice(`Provider "${provider.modelId}" (${provider.dimensions} dims) already matches the database. Config updated.`);
      onConfigChanged();
      setPhase({ kind: 'idle' });
      setRefreshKey((k) => k + 1);
      return;
    }

    const nothingToMigrate = impact.memoriesCount === 0 && impact.goalsCount === 0;
    const run = async (): Promise<void> => {
      try {
        const result = await migrateEmbeddings(db.db, provider);
        applyConfig();
        onConfigChanged();
        setNotice(
          `Switched to ${result.newModelId} — ${result.memoriesReembed} memories, ` +
            `${result.goalsReembed} goals re-embedded. Threshold reset to 0.6.`
        );
      } catch (e) {
        setNotice(`Migration failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      setPhase({ kind: 'idle' });
      setRefreshKey((k) => k + 1);
    };

    if (nothingToMigrate) {
      setPhase({ kind: 'busy', title: 'Migrating embeddings…' });
      await run();
      return;
    }

    pendingTaskRef.current = run;
    setNotice(undefined);
    setPhase({ kind: 'confirm', text: buildSwitchText(impact) });
  };

  const buildSwitchText = (impact: MigrationImpact): string => {
    const lines = [
      `Switch embeddings: ${impact.oldModelId} -> ${impact.newModelId}`,
      `  Memories to re-embed: ${impact.memoriesCount}`,
      `  Goals to re-embed   : ${impact.goalsCount}`,
      impact.dimensionsChanged ? '  Vector tables will be RECREATED at the new dimension.' : '  Vector tables stay at the same dimension (rows cleared + re-embedded).',
      '  Adaptive threshold will reset to 0.6.',
      'Proceed with migration? [y]es  [n]o',
    ];
    return lines.join('\n');
  };

  useInput((input, key) => {
    const p = phase;
    if (overlayHeight > 0) return; // an overlay owns the terminal while open

    if (p.kind === 'busy') {
      return;
    }
    if (p.kind === 'prompt') {
      if (key.escape) {
        setNotice('Cancelled.');
        setPhase({ kind: 'idle' });
      }
      return;
    }
    if (p.kind === 'confirm') {
      if (input === 'y') {
        const task = pendingTaskRef.current;
        pendingTaskRef.current = null;
        setPhase({ kind: 'busy', title: 'Working…' });
        void (async () => {
          try {
            await task?.();
          } finally {
            if (phase.kind !== 'busy') return;
            setPhase({ kind: 'idle' });
          }
        })();
      } else if (input === 'n' || key.escape) {
        setNotice('Cancelled. No changes were made.');
        setPhase({ kind: 'idle' });
      }
      return;
    }

    if (input === 'q' || key.escape) {
      onBack();
      return;
    }
    if (input === 'c') {
      setNotice(undefined);
      setPromptValue('');
      setPhase({ kind: 'prompt', title: 'Embedding worker URL:' });
      promptActionRef.current = onUrlSubmit;
      return;
    }
    if (input === 'l') {
      setNotice(undefined);
      startLocal();
      return;
    }
    if (input === 'r') {
      pendingTaskRef.current = async () => {
        resetThreshold(db.db);
        setNotice('Adaptive threshold reset to 0.6.');
      };
      setNotice(undefined);
      setPhase({ kind: 'confirm', text: 'Reset the adaptive threshold to 0.6 and zero the counters? [y]es  [n]o' });
    }
  });

  const handlePromptSubmit = (value: string): void => {
    const action = promptActionRef.current;
    promptActionRef.current = () => {};
    const v = value.trim();
    setPromptValue('');
    action(v);
  };

  const { configured, status, settingsRow } = info;
  const modeLabel = configured.mode === 'none' ? 'not set' : configured.mode;

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>
          Settings
        </Text>
        <Text color={theme.header}>
          {' '}
          — /embedded-config
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        <Text color={theme.header} bold>
          LLM
        </Text>
        <Text color={theme.text}>
          {'  '}provider <Text color={theme.muted}>{info.config.provider ?? 'openai (default)'}</Text>
          {info.config.model ? (
            <Text color={theme.muted}>{' · model '}{info.config.model}</Text>
          ) : null}
        </Text>

        <Text color={theme.header} bold>
          Memory / embeddings
        </Text>
        <Text color={theme.text}>
          {'  '}mode  <Text color={theme.muted}>{modeLabel}</Text>
        </Text>
        <Text color={theme.text}>
          {'  '}model <Text color={theme.muted}>{configured.modelId ?? '—'}</Text>{'  '}
          dims <Text color={theme.muted}>{configured.dimensions ?? '—'}</Text>
        </Text>
        {configured.mode === 'cloud' && (
          <Text color={theme.text}>
            {'  '}url   <Text color={theme.muted}>{info.config.memory?.embeddingWorkerUrl ?? '—'}</Text>
          </Text>
        )}
        <Text color={theme.text}>
          {'  '}db    <Text color={theme.muted}>{status.dbModelId ?? '(fresh db)'}</Text>{'  '}
          dims <Text color={theme.muted}>{status.dbDimensions ?? '—'}</Text>{'  '}
          <Text color={status.migrationNeeded ? theme.statusErr : theme.statusOk}>
            {status.migrationNeeded ? 'MIGRATION NEEDED' : status.consistent ? 'consistent' : 'check'}
          </Text>
        </Text>
        <Text color={theme.text}>
          {'  '}counts <Text color={theme.muted}>
            {status.memoriesCount} memories ({status.memoriesVectorized} vectorized)
            {'  '}
            {status.goalsCount} goals
          </Text>
        </Text>

        <Text color={theme.header} bold>
          Adaptive threshold
        </Text>
        <Text color={theme.text}>
          {'  '}threshold <Text color={theme.muted}>{settingsRow.similarity_threshold.toFixed(2)}</Text>
          {'  '}confirmed <Text color={theme.statusOk}>{settingsRow.switch_confirmed_count}</Text>
          {'  '}rejected <Text color={theme.statusErr}>{settingsRow.switch_rejected_count}</Text>
          {'  '}total <Text color={theme.muted}>{settingsRow.total_confirmations}</Text>
        </Text>

        {status.issues.length > 0 && (
          <Box marginTop={1}>
            <Box flexDirection="column">
              {status.issues.map((issue, i) => (
                <Text key={i} color={theme.statusWarn}>
                  {'  ! '}
                  {issue}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {notice && (
        <Box>
          <Text color={theme.statusWarn}>{notice}</Text>
        </Box>
      )}

      {phase.kind === 'busy' && (
        <Box borderStyle="round" borderColor={theme.border} paddingX={1} marginBottom={1}>
          <Text color={theme.accent}>
            {'… '}
            {phase.title}
          </Text>
        </Box>
      )}

      {phase.kind === 'confirm' && (
        <Box borderStyle="round" borderColor={theme.statusWarn} paddingX={1} paddingY={1} marginBottom={1}>
          <Text color={theme.text}>{phase.text}</Text>
        </Box>
      )}

      {phase.kind === 'prompt' && (
        <Box marginBottom={1}>
          <Text color={theme.muted} dimColor>
            {phase.title}
          </Text>
          <Box flexDirection="row">
            <Text color={theme.accent} bold>
              {'> '}
            </Text>
            <PromptInput
              value={promptValue}
              onChange={setPromptValue}
              onSubmit={handlePromptSubmit}
              isEnabled={overlayHeight === 0}
            />
          </Box>
        </Box>
      )}

      <Text color={theme.muted} dimColor>
        [c] switch cloud · [l] switch local · [r] reset threshold · q/esc back
      </Text>
    </Box>
  );
}