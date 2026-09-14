import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { theme } from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';
import type { ProviderDesc, ProviderTestResult } from '@absolute/providers';

export interface ConnectFlowProps {
  providers: ProviderDesc[];
  connectedIds: Set<string>;
  onStoreKey: (providerId: string, key: string) => Promise<void>;
  onTestKey: (providerId: string, key: string) => Promise<ProviderTestResult>;
  onClose: () => void;
  height?: number;
}

export const CONNECT_FLOW_HEIGHT = 10;

type Step = 'pick-provider' | 'enter-key';

export function ConnectFlow({
  providers,
  connectedIds,
  onStoreKey,
  onTestKey,
  onClose,
  height = CONNECT_FLOW_HEIGHT,
}: ConnectFlowProps): JSX.Element {
  const [step, setStep] = useState<Step>('pick-provider');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderDesc | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return providers;
    const results = fuzzysort.go(q, providers, {
      keys: ['name', 'id'],
      threshold: 0.3,
    });
    return results.map((r) => r.obj);
  }, [providers, query]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, filtered.length - 1))), [filtered.length]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (step === 'pick-provider') {
      if (key.upArrow) {
        setSel(Math.max(0, sel - 1));
        return;
      }
      if (key.downArrow) {
        setSel((s) => Math.min(filtered.length - 1, s + 1));
        return;
      }
      if (key.tab) {
        setSel((s) => (s + 1) % Math.max(1, filtered.length));
        return;
      }
    }
    void input;
  });

  const submitKey = async (): Promise<void> => {
    if (!selectedProvider || !keyValue.trim()) return;
    setTesting(true);
    setError(null);
    try {
      const result = await onTestKey(selectedProvider.id, keyValue.trim());
      if (result.ok) {
        await onStoreKey(selectedProvider.id, keyValue.trim());
        onClose();
      } else {
        setError(result.message);
        setTesting(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTesting(false);
    }
  };

  const listLines = Math.max(1, height - 2);
  const visible = filtered.slice(0, listLines);

  if (step === 'enter-key' && selectedProvider) {
    return (
      <Box
        borderStyle="single"
        borderColor={theme.border}
        flexDirection="column"
        paddingX={1}
        paddingTop={1}
        paddingBottom={1}
        overflowY="hidden"
      >
        <Box flexDirection="row" marginBottom={1}>
          <Text color={theme.accent}>
            connect {selectedProvider.name}{' '}
          </Text>
          <Text color={theme.muted} dimColor>
            paste your API key · enter to save · esc cancel
          </Text>
        </Box>
        <Box flexDirection="row" marginBottom={1}>
          <Text color={theme.muted}>
            key{' '}
          </Text>
          <PromptInput
            value={keyValue}
            onChange={setKeyValue}
            onSubmit={() => { void submitKey(); }}
            onEscape={onClose}
            masked
          />
        </Box>
        {testing && (
          <Text color={theme.muted} dimColor>
            {'  '}validating...
          </Text>
        )}
        {error && (
          <Text color={theme.accent}>
            {'  '}{error}
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box
      borderStyle="single"
      borderColor={theme.border}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
      paddingBottom={1}
      overflowY="hidden"
    >
      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.accent}>
          connect{' '}
        </Text>
        <PromptInput
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            const item = filtered[sel] ?? filtered[0];
            if (item) {
              setSelectedProvider(item);
              setStep('enter-key');
              setQuery('');
              setSel(0);
              setError(null);
            }
          }}
          onEscape={onClose}
        />
        <Text color={theme.muted} dimColor>
          {'  '}esc close · ↑/↓ pick · enter select
        </Text>
      </Box>
      <Box flexDirection="column">
        {visible.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  no providers'}
          </Text>
        ) : (
          visible.map((item, i) => (
            <Box key={item.id} flexDirection="row">
              <Text color={i === sel ? theme.accent : theme.muted}>
                {i === sel ? '\u25cf ' : '  '}
              </Text>
              <Text color={i === sel ? theme.text : theme.muted}>
                {item.name}
              </Text>
              <Text color={theme.muted} dimColor>
                {'  '}{connectedIds.has(item.id) ? 'connected' : 'not connected'}
              </Text>
              {item.freeTier ? (
                <Text color={theme.accent} dimColor>
                  {'  '}free
                </Text>
              ) : null}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
