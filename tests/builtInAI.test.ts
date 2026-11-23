import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectBuiltInAI,
  isBuiltInAIReadySync,
  prepareBuiltInAI,
  parseTransactionWithBuiltInAI,
  extractQueryIntentWithBuiltInAI,
  destroyBuiltInAISession,
  resetBuiltInAICacheForTesting,
} from '../src/builtInAI';
import { extractFinancialQueryIntent } from '../src/finance/queryEngine';

const g = globalThis as unknown as {
  LanguageModel?: any;
  ai?: any;
};

describe('Chrome Built-in AI (LanguageModel) Auto-Detection & On-Device Integration', () => {
  const originalLanguageModel = g.LanguageModel;
  const originalAi = g.ai;

  beforeEach(() => {
    delete g.LanguageModel;
    delete g.ai;
    resetBuiltInAICacheForTesting();
  });

  afterEach(() => {
    resetBuiltInAICacheForTesting();
    if (originalLanguageModel !== undefined) {
      g.LanguageModel = originalLanguageModel;
    } else {
      delete g.LanguageModel;
    }
    if (originalAi !== undefined) {
      g.ai = originalAi;
    } else {
      delete g.ai;
    }
    vi.restoreAllMocks();
  });

  it('gracefully reports unavailable on browsers without LanguageModel (e.g., mobile browsers)', async () => {
    const status = await detectBuiltInAI(true);
    expect(status.state).toBe('unavailable');
    expect(status.supported).toBe(false);
    expect(status.source).toBe('none');
    expect(isBuiltInAIReadySync()).toBe(false);
  });

  it('auto-detects standard global LanguageModel when available', async () => {
    g.LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn(),
    };

    const status = await detectBuiltInAI(true);
    expect(status.state).toBe('available');
    expect(status.supported).toBe(true);
    expect(status.source).toBe('language-model');
    expect(isBuiltInAIReadySync()).toBe(true);
  });

  it('auto-detects legacy window.ai.languageModel capabilities ("readily" -> "available")', async () => {
    g.ai = {
      languageModel: {
        capabilities: vi.fn().mockResolvedValue({ available: 'readily' }),
        create: vi.fn(),
      },
    };

    const status = await detectBuiltInAI(true);
    expect(status.state).toBe('available');
    expect(status.supported).toBe(true);
    expect(status.source).toBe('window-ai');
  });

  it('supports one-tap prepareBuiltInAI with progress reporting when downloadable', async () => {
    const destroyMock = vi.fn();
    let currentState = 'downloadable';

    g.LanguageModel = {
      availability: vi.fn().mockImplementation(async () => currentState),
      create: vi.fn().mockImplementation(async (opts?: any) => {
        if (opts?.monitor) {
          opts.monitor({
            addEventListener: (_type: string, cb: (e: { loaded: number; total: number }) => void) => {
              cb({ loaded: 50, total: 100 });
            },
          });
        }
        currentState = 'available';
        return { prompt: vi.fn(), destroy: destroyMock };
      }),
    };

    const initial = await detectBuiltInAI(true);
    expect(initial.state).toBe('downloadable');

    const progressUpdates: number[] = [];
    const prepared = await prepareBuiltInAI((pct) => progressUpdates.push(pct));

    expect(progressUpdates).toContain(50);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(prepared.state).toBe('available');
  });

  it('parses natural-language transactions via LanguageModel and handles fenced JSON cleanly', async () => {
    const promptMock = vi.fn().mockResolvedValue(
      '```json\n{"items":[{"type":"EXPENSE","amount":12500,"currency":"KRW","category":"Food","merchant":"을지로 칼국수","paymentMethod":"현대카드","date":"2026-11-23"}]}\n```'
    );
    const destroyMock = vi.fn();

    g.LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({ prompt: promptMock, destroy: destroyMock }),
    };

    const items = await parseTransactionWithBuiltInAI('을지로 칼국수 12500원 현대카드 결제', 'KRW');
    expect(items).not.toBeNull();
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({
      type: 'EXPENSE',
      amount: 12500,
      currency: 'KRW',
      category: 'Food',
      merchant: '을지로 칼국수',
      paymentMethod: '현대카드',
    });

    destroyBuiltInAISession();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('returns null safely when Built-in AI produces malformed JSON or non-positive amounts', async () => {
    const promptMock = vi
      .fn()
      .mockResolvedValueOnce('not valid json at all')
      .mockResolvedValueOnce('{"items":[{"type":"EXPENSE","amount":-500,"merchant":"Bad"}]}');

    g.LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({ prompt: promptMock, destroy: vi.fn() }),
    };

    const first = await parseTransactionWithBuiltInAI('아무 말이나 입력', 'KRW');
    expect(first).toBeNull();

    const second = await parseTransactionWithBuiltInAI('마이너스 금액', 'KRW');
    expect(second).toBeNull();
  });

  it('extracts structured FinancialQueryParameters and auto-routes inside extractFinancialQueryIntent', async () => {
    const promptMock = vi.fn().mockResolvedValue(
      JSON.stringify({
        metric: 'category_sum',
        year: 2026,
        month: 11,
        category: 'Food',
      })
    );

    g.LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({ prompt: promptMock, destroy: vi.fn() }),
    };

    const direct = await extractQueryIntentWithBuiltInAI('이번 달 식비 얼마 썼어?');
    expect(direct).toEqual({
      metric: 'category_sum',
      year: 2026,
      month: 11,
      category: 'Food',
    });

    const routed = await extractFinancialQueryIntent('이번 달 식비 얼마 썼어?', {
      engineType: 'local',
      localModel: 'gemma-2b',
      provider: 'gemini',
      modelTier: 'gemini-3.8-flash',
      apiKey: '',
    });
    expect(routed.source).toBe('builtin_ai');
    expect(routed.parameters.metric).toBe('category_sum');
    expect(routed.parameters.category).toBe('Food');
  });

  it('rejects unknown query metrics so queryEngine falls back cleanly to local parser', async () => {
    g.LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue('{"metric":"hallucinated_metric","month":11}'),
        destroy: vi.fn(),
      }),
    };

    const direct = await extractQueryIntentWithBuiltInAI('11월 식비 알려줘');
    expect(direct).toBeNull();

    const routed = await extractFinancialQueryIntent('11월 식비 알려줘', {
      engineType: 'local',
      localModel: 'gemma-2b',
      provider: 'gemini',
      modelTier: 'gemini-3.8-flash',
      apiKey: '',
    });
    expect(routed.source).toBe('local');
    expect(routed.parameters.metric).toBe('category_sum');
  });
});
