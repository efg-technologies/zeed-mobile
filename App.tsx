// Zeed Mobile — Expo entry.
// Multi-tab WebView + bottom-sheet chat. Agent path A (local JS injection)
// is the default; path B (cloud autopilot) is opt-in via settings.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import {
  Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';

import {
  buildClickByLabelJs, buildClickBySelectorJs, buildReadPageJs,
} from './src/webview/bridge.ts';
import { normalizeUrlOrSearch } from './src/webview/url.ts';

function faviconFor(u: string): string | null {
  try {
    const host = new URL(u).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname || u;
  } catch {
    return u;
  }
}
import { chat } from './src/llm/openrouter.ts';
import { runAgent, type AgentAction, type PageObservation } from './src/agent/loop.ts';
import {
  KEYS, setSecureBackend, getSecret, setSecret,
  type SecureBackend,
} from './src/storage/secure.ts';
import {
  loadBookmarks, saveBookmarks, isBookmarked, toggleBookmark,
  type Bookmark,
} from './src/storage/bookmarks.ts';
import {
  loadHistory, saveHistory, recordVisit,
  type HistoryEntry,
} from './src/storage/history.ts';
import {
  loadLikes, saveLikes, isLiked, toggleLike,
  type Like,
} from './src/storage/likes.ts';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings,
} from './src/storage/settings.ts';
import { rankSuggestions, type Suggestion } from './src/search/rank.ts';
import { fetchGoogleSuggestions } from './src/search/google.ts';
import { resolveShortcut } from './src/search/shortcut.ts';
import {
  logger, getLogs, clearLogs, subscribe as subscribeLogs, withTimeout,
  type LogEntry,
} from './src/debug/log.ts';

const secureStoreBackend: SecureBackend = {
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) => SecureStore.setItemAsync(k, v),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
};
setSecureBackend(secureStoreBackend);

const HOME_URL = 'https://zeed.run';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };
type Tab = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

let tabSeq = 0;
const newTab = (url = HOME_URL): Tab => ({
  id: `t${++tabSeq}`,
  url,
  title: url,
  loading: false,
  canGoBack: false,
  canGoForward: false,
});

export default function App() {
  const webviewRefs = useRef<Record<string, WebView | null>>({});
  const initialTab = useMemo(() => newTab(), []);
  const [tabs, setTabs] = useState<Tab[]>(() => [initialTab]);
  const [activeId, setActiveId] = useState<string>(initialTab.id);
  const [tabListOpen, setTabListOpen] = useState(false);

  const active: Tab = tabs.find((t) => t.id === activeId) ?? tabs[0]!;
  const [urlInput, setUrlInput] = useState(active.url);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastStep, setLastStep] = useState<string | null>(null);
  const [dots, setDots] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);
  const [mode, setMode] = useState<'auto' | 'ask' | 'search'>('auto');

  useEffect(() => {
    if (!busy) { setDots(''); return; }
    const frames = ['.', '..', '...', ''];
    let i = 0;
    setDots(frames[0]!);
    const id = setInterval(() => {
      i = (i + 1) % frames.length;
      setDots(frames[i]!);
    }, 350);
    return () => clearInterval(id);
  }, [busy]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [urlFocused, setUrlFocused] = useState(false);
  const [googleSugg, setGoogleSugg] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  useEffect(() => {
    loadBookmarks(AsyncStorage).then(setBookmarks).catch(() => { /* ignore */ });
    loadLikes(AsyncStorage).then(setLikes).catch(() => { /* ignore */ });
    loadHistory(AsyncStorage).then(setHistory).catch(() => { /* ignore */ });
    loadSettings(AsyncStorage).then(setSettings).catch(() => { /* ignore */ });
  }, []);

  // Default-browser handoff: when the OS hands us an http/https URL (via
  // "Open in Zeed" / default-browser routing), open it in a fresh tab.
  useEffect(() => {
    const openUrl = (incoming: string | null) => {
      if (!incoming) return;
      if (!/^https?:\/\//i.test(incoming)) return;
      logger.info(`incoming URL: ${incoming.slice(0, 120)}`);
      const t = newTab(incoming);
      setTabs((ts) => [...ts, t]);
      setActiveId(t.id);
      setUrlInput(incoming);
    };
    Linking.getInitialURL().then(openUrl).catch(() => { /* ignore */ });
    const sub = Linking.addEventListener('url', (e) => openUrl(e.url));
    return () => sub.remove();
  }, []);

  const toggleCurrentBookmark = useCallback(() => {
    setBookmarks((prev) => {
      const next = toggleBookmark(prev, active.url, active.title || active.url, Date.now());
      saveBookmarks(AsyncStorage, next).catch(() => { /* ignore */ });
      return next;
    });
  }, [active.url, active.title]);

  const toggleCurrentLike = useCallback(() => {
    setLikes((prev) => {
      const next = toggleLike(prev, active.url, active.title || active.url, Date.now());
      saveLikes(AsyncStorage, next).catch(() => { /* ignore */ });
      return next;
    });
  }, [active.url, active.title]);

  const activeBookmarked = isBookmarked(bookmarks, active.url);
  const activeLiked = isLiked(likes, active.url);

  const pendingObs = useRef<((o: PageObservation) => void) | null>(null);
  const chatScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!chatPanelOpen) return;
    const t = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages, chatPanelOpen, lastStep]);

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Debounced Google suggest fetch (opt-in via settings). Aborts in-flight
  // request on each keystroke so we don't race ourselves.
  useEffect(() => {
    if (!urlFocused || !settings.googleSuggestEnabled || !urlInput.trim()) {
      setGoogleSugg([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchGoogleSuggestions(urlInput, { signal: ctrl.signal })
        .then(setGoogleSugg)
        .catch(() => { /* ignore */ });
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [urlFocused, urlInput, settings.googleSuggestEnabled]);

  const shortcutUrl = useMemo(
    () => resolveShortcut(urlInput, { bookmarks, likes, history }),
    [urlInput, bookmarks, likes, history],
  );

  const suggestions: Suggestion[] = useMemo(
    () => (urlFocused
      ? rankSuggestions({
        query: urlInput, bookmarks, likes, history, googleSuggestions: googleSugg,
        shortcutUrl, limit: 8,
      })
      : []),
    [urlFocused, urlInput, bookmarks, likes, history, googleSugg, shortcutUrl],
  );

  const pickSuggestion = useCallback((s: Suggestion) => {
    updateTab(activeId, { url: s.url });
    setUrlInput(s.url);
    setUrlFocused(false);
    Keyboard.dismiss();
  }, [activeId, updateTab]);

  const observe = useCallback((): Promise<PageObservation> => {
    const p = new Promise<PageObservation>((resolve, reject) => {
      const wv = webviewRefs.current[activeId];
      if (!wv) { reject(new Error('no active webview')); return; }
      pendingObs.current = (o) => { resolve(o); };
      logger.debug(`observe → inject read_page (tab ${activeId})`);
      wv.injectJavaScript(buildReadPageJs(false));
    });
    return withTimeout(p, 8000, 'observe').catch((e) => {
      pendingObs.current = null;
      throw e;
    });
  }, [activeId]);

  const act = useCallback(async (action: AgentAction): Promise<{ ok: boolean; error?: string }> => {
    const wv = webviewRefs.current[activeId];
    if (!wv) return { ok: false, error: 'webview gone' };
    switch (action.tool) {
      case 'click_by_label':
        if (!action.label) return { ok: false, error: 'missing label' };
        wv.injectJavaScript(buildClickByLabelJs(action.label, action.role ?? ''));
        return { ok: true };
      case 'click_by_selector':
        if (!action.selector) return { ok: false, error: 'missing selector' };
        wv.injectJavaScript(buildClickBySelectorJs(action.selector));
        return { ok: true };
      case 'read_page':
        wv.injectJavaScript(buildReadPageJs(action.interactiveOnly ?? false));
        return { ok: true };
      case 'navigate':
        if (!action.url) return { ok: false, error: 'missing url' };
        updateTab(activeId, { url: action.url });
        setUrlInput(action.url);
        return { ok: true };
      default:
        return { ok: false, error: `unknown tool: ${action.tool}` };
    }
  }, [activeId, updateTab]);

  const onWebViewMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'read_page' && pendingObs.current) {
        logger.debug(
          `observe ← read_page (title="${(data.title || '').slice(0, 40)}" `
          + `interactives=${Array.isArray(data.interactives) ? data.interactives.length : 0})`,
        );
        pendingObs.current({
          url: data.url ?? active.url,
          title: data.title ?? '',
          text: data.text ?? '',
          interactives: data.interactives ?? [],
        });
        pendingObs.current = null;
      }
    } catch {
      // ignore non-JSON messages
    }
  }, [active.url]);

  const onNavStateChange = useCallback((tabId: string, s: WebViewNavigation) => {
    updateTab(tabId, {
      url: s.url,
      title: s.title || s.url,
      loading: s.loading,
      canGoBack: s.canGoBack,
      canGoForward: s.canGoForward,
    });
    if (tabId === activeId && !urlFocused) setUrlInput(s.url);
    if (!s.loading && s.url && /^https?:/i.test(s.url)) {
      setHistory((prev) => {
        const next = recordVisit(prev, s.url, s.title || s.url, Date.now());
        saveHistory(AsyncStorage, next).catch(() => { /* ignore */ });
        return next;
      });
    }
  }, [activeId, urlFocused, updateTab]);

  const runTaskWith = useCallback(async (goalRaw: string) => {
    const goal = goalRaw.trim();
    if (!goal || busy) return;
    setMessages((m) => [...m, { role: 'user', content: goal }]);
    logger.info(`agent start: "${goal.slice(0, 80)}"`);
    const apiKey = await getSecret(KEYS.openrouterApiKey);
    if (!apiKey) {
      logger.warn('agent: no OpenRouter key set');
      setMessages((m) => [...m, {
        role: 'assistant',
        content: 'Set your OpenRouter API key first (tap Menu → OpenRouter).',
      }]);
      return;
    }
    setBusy(true);
    setLastStep('thinking');
    try {
      const result = await runAgent(goal, {
        observe,
        act,
        reason: async (msgs) => {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 30000);
          logger.debug(`chat → openrouter (${msgs.length} msgs)`);
          try {
            const r = await chat(apiKey, msgs, { signal: ctrl.signal });
            if (r.error) logger.warn(`chat error: ${r.error}`);
            else logger.debug(`chat ← ${r.response.slice(0, 80)}`);
            return { response: r.response, error: r.error };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(`chat threw: ${msg}`);
            return { response: '', error: `chat failed: ${msg}` };
          } finally { clearTimeout(to); }
        },
        onStep: (s) => {
          const line = `step ${s.index}: ${s.action.tool}`
            + (s.action.label ? ` "${s.action.label}"` : '')
            + (s.action.url ? ` ${s.action.url}` : '');
          logger.info(line);
          setLastStep(line);
          setMessages((m) => [...m, { role: 'system', content: line }]);
        },
      });
      logger.info(`agent end: ok=${result.ok} ${result.error ?? ''}`);
      setMessages((m) => [...m, {
        role: 'assistant',
        content: result.ok
          ? (result.summary || 'done')
          : `stopped: ${result.error}${result.suggestAutopilot ? ' — try Autopilot?' : ''}`,
      }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`agent threw: ${msg}`);
      setMessages((m) => [...m, { role: 'assistant', content: `error: ${msg}` }]);
    } finally {
      setBusy(false);
      setLastStep(null);
    }
  }, [busy, observe, act]);

  const runAskFromOmnibox = useCallback(async () => {
    const goal = urlInput.trim();
    if (!goal) return;
    setUrlInput('');
    // Intentionally keep focus + keyboard so user can chain follow-ups.
    setChatPanelOpen(true);
    await runTaskWith(goal);
  }, [urlInput, runTaskWith]);

  const onUrlSubmit = useCallback(() => {
    const target = shortcutUrl ?? normalizeUrlOrSearch(urlInput);
    updateTab(activeId, { url: target });
    setUrlInput(target);
    setUrlFocused(false);
    Keyboard.dismiss();
  }, [urlInput, shortcutUrl, activeId, updateTab]);

  // Auto   : URL-like / shortcut → navigate; else → agent
  // Ask    : always hand the input to the agent
  // Search : always navigate (URL) or Google-search (free text)
  const onOmniboxPrimary = useCallback(() => {
    const q = urlInput.trim();
    if (!q) return;
    if (mode === 'ask') { runAskFromOmnibox(); return; }
    if (mode === 'search') { onUrlSubmit(); return; }
    const urlLike = /^https?:\/\//i.test(q) || /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(q);
    if (urlLike || shortcutUrl) onUrlSubmit();
    else runAskFromOmnibox();
  }, [mode, urlInput, shortcutUrl, onUrlSubmit, runAskFromOmnibox]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(AsyncStorage, next).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const clearHistoryAction = useCallback(() => {
    setHistory([]);
    saveHistory(AsyncStorage, []).catch(() => { /* ignore */ });
  }, []);
  const clearBookmarksAction = useCallback(() => {
    setBookmarks([]);
    saveBookmarks(AsyncStorage, []).catch(() => { /* ignore */ });
  }, []);
  const clearLikesAction = useCallback(() => {
    setLikes([]);
    saveLikes(AsyncStorage, []).catch(() => { /* ignore */ });
  }, []);

  const shareActivePage = useCallback(async () => {
    const url = active.url;
    if (!url || /^about:/i.test(url)) {
      logger.warn(`share: invalid url (${url})`);
      return;
    }
    Keyboard.dismiss();
    try {
      logger.info(`share: ${url}`);
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { url, message: active.title || url }
          : { message: `${active.title ? active.title + '\n' : ''}${url}` },
        { dialogTitle: 'Share page' },
      );
      logger.debug(`share result: ${result.action}`);
    } catch (e) {
      logger.warn(`share failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [active.url, active.title]);

  const goBack = useCallback(() => webviewRefs.current[activeId]?.goBack(), [activeId]);
  const goForward = useCallback(() => webviewRefs.current[activeId]?.goForward(), [activeId]);
  const reload = useCallback(() => webviewRefs.current[activeId]?.reload(), [activeId]);

  const openNewTab = useCallback(() => {
    const t = newTab();
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
    setUrlInput(t.url);
    setTabListOpen(false);
  }, []);

  const openBookmark = useCallback((b: Bookmark) => {
    updateTab(activeId, { url: b.url });
    setUrlInput(b.url);
    setTabListOpen(false);
  }, [activeId, updateTab]);

  const removeBookmarkAt = useCallback((url: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((x) => x.url !== url);
      saveBookmarks(AsyncStorage, next).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const switchTab = useCallback((id: string) => {
    setActiveId(id);
    const t = tabs.find((x) => x.id === id);
    if (t) setUrlInput(t.url);
    setTabListOpen(false);
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = newTab();
        setActiveId(fresh.id);
        setUrlInput(fresh.url);
        return [fresh];
      }
      if (id === activeId) {
        const first = next[0]!;
        setActiveId(first.id);
        setUrlInput(first.url);
      }
      return next;
    });
    delete webviewRefs.current[id];
  }, [activeId]);

  const chatRendered = useMemo(() => messages.map((m, i) => (
    <View key={i} style={[styles.msg, m.role === 'user' ? styles.msgUser : m.role === 'system' ? styles.msgSystem : styles.msgBot]}>
      <Text style={styles.msgText}>{m.content}</Text>
    </View>
  )), [messages]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex1}
      >
        <Pressable
          style={styles.topBar}
          onLongPress={shareActivePage}
          delayLongPress={350}
        >
          <Text style={styles.topHost} numberOfLines={1}>{hostnameOf(active.url)}</Text>
        </Pressable>
        {active.loading && (
          <View style={styles.progressBar} />
        )}
        <View style={styles.webWrap}>
          {tabs.map((t) => (
            <View
              key={t.id}
              style={[styles.webLayer, t.id === activeId ? styles.webLayerActive : styles.webLayerHidden]}
              pointerEvents={t.id === activeId ? 'auto' : 'none'}
            >
              <WebView
                ref={(r) => { webviewRefs.current[t.id] = r; }}
                source={{ uri: t.url }}
                onMessage={onWebViewMessage}
                onNavigationStateChange={(s) => onNavStateChange(t.id, s)}
                onLoadStart={() => updateTab(t.id, { loading: true })}
                onLoadEnd={() => updateTab(t.id, { loading: false })}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                allowsBackForwardNavigationGestures
                pullToRefreshEnabled
                decelerationRate="normal"
                contentInsetAdjustmentBehavior="automatic"
                overScrollMode="always"
                nestedScrollEnabled
                renderError={(domain, code, desc) => (
                  <WebViewError
                    url={t.url}
                    code={code}
                    desc={desc}
                    domain={domain}
                    onRetry={() => webviewRefs.current[t.id]?.reload()}
                    onSearch={() => {
                      const host = hostnameOf(t.url) || t.url;
                      const target = `https://www.google.com/search?q=${encodeURIComponent(host)}`;
                      updateTab(t.id, { url: target });
                      if (t.id === activeId) setUrlInput(target);
                    }}
                  />
                )}
              />
            </View>
          ))}
        </View>
        {tabListOpen && (
          <ScrollView style={styles.tabList} contentContainerStyle={styles.tabListContent}>
            <Text style={styles.tabListHeader}>Tabs</Text>
            {tabs.map((t) => {
              const favicon = faviconFor(t.url);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => switchTab(t.id)}
                  style={[styles.tabCard, t.id === activeId && styles.tabCardActive]}
                >
                  <View style={styles.tabCardThumb}>
                    {favicon ? (
                      <Image source={{ uri: favicon }} style={styles.tabCardFavicon} />
                    ) : (
                      <Text style={styles.tabCardThumbPlaceholder}>?</Text>
                    )}
                  </View>
                  <View style={styles.tabCardBody}>
                    <Text style={styles.tabCardTitle} numberOfLines={1}>
                      {t.title || t.url}
                    </Text>
                    <Text style={styles.tabCardUrl} numberOfLines={1}>{t.url}</Text>
                  </View>
                  <Pressable onPress={() => closeTab(t.id)} style={styles.tabClose} hitSlop={8}>
                    <Text style={styles.tabCloseText}>×</Text>
                  </Pressable>
                </Pressable>
              );
            })}
            {bookmarks.length > 0 && (
              <Text style={styles.tabListHeader}>Bookmarks</Text>
            )}
            {bookmarks.map((b) => {
              const favicon = faviconFor(b.url);
              return (
                <Pressable
                  key={`bm:${b.url}`}
                  onPress={() => openBookmark(b)}
                  style={styles.tabCard}
                >
                  <View style={styles.tabCardThumb}>
                    {favicon ? (
                      <Image source={{ uri: favicon }} style={styles.tabCardFavicon} />
                    ) : (
                      <Text style={styles.tabCardThumbPlaceholder}>★</Text>
                    )}
                  </View>
                  <View style={styles.tabCardBody}>
                    <Text style={styles.tabCardTitle} numberOfLines={1}>{b.title}</Text>
                    <Text style={styles.tabCardUrl} numberOfLines={1}>{b.url}</Text>
                  </View>
                  <Pressable
                    onPress={() => removeBookmarkAt(b.url)}
                    style={styles.tabClose}
                    hitSlop={8}
                  >
                    <Text style={styles.tabCloseText}>×</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {messages.length > 0 && chatPanelOpen && (
          <View style={styles.chatPanel}>
            <View style={styles.chatPanelHeader}>
              <Text style={styles.chatPanelTitle}>Zeed</Text>
              <Pressable onPress={() => setChatPanelOpen(false)} hitSlop={8}>
                <Text style={styles.chatPanelToggle}>hide</Text>
              </Pressable>
            </View>
            <ScrollView
              ref={chatScrollRef}
              style={styles.chatScroll}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {chatRendered}
            </ScrollView>
          </View>
        )}
        {messages.length > 0 && !chatPanelOpen && (
          <Pressable
            onPress={() => setChatPanelOpen(true)}
            style={styles.chatReopen}
          >
            <Text style={styles.chatReopenText}>
              {messages.length} message{messages.length === 1 ? '' : 's'} · show
            </Text>
          </Pressable>
        )}
        {busy && (
          <View style={styles.statusBar}>
            <Text style={styles.statusDots}>{dots || '.'}</Text>
            <Text style={styles.statusText} numberOfLines={1}>
              {lastStep ?? 'thinking'}
            </Text>
          </View>
        )}
        {suggestions.length > 0 && (
          <ScrollView
            style={styles.suggestions}
            keyboardShouldPersistTaps="handled"
          >
            {suggestions.map((s, i) => {
              const favicon = faviconFor(s.url);
              return (
                <Pressable
                  key={`sugg:${s.source}:${s.url}:${i}`}
                  onPress={() => pickSuggestion(s)}
                  style={styles.suggestionRow}
                >
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>{SOURCE_ICON[s.source]}</Text>
                  </View>
                  {favicon && s.source !== 'direct' && s.source !== 'google' ? (
                    <Image source={{ uri: favicon }} style={styles.suggestionFavicon} />
                  ) : (
                    <View style={styles.suggestionFaviconFallback} />
                  )}
                  <View style={styles.suggestionBody}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>{s.title}</Text>
                    {s.subtitle ? (
                      <Text style={styles.suggestionUrl} numberOfLines={1}>{s.subtitle}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.modeBar}>
          {(['auto', 'ask', 'search'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeSeg, mode === m && modeSegActiveStyle(m)]}
            >
              <Text style={[styles.modeSegText, mode === m && styles.modeSegTextActive]}>
                {MODE_LABEL[m]}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.modeHint}>{MODE_HINT[mode]}</Text>
        </View>
        <View style={styles.omnibox}>
          <TextInput
            style={styles.omniInput}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={onOmniboxPrimary}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={MODE_PLACEHOLDER[mode]}
            placeholderTextColor="#666"
            selectTextOnFocus
            returnKeyType={mode === 'search' ? 'go' : 'send'}
          />
          <Pressable
            onPress={onOmniboxPrimary}
            disabled={busy || !urlInput.trim()}
            style={[styles.omniBtn, (busy || !urlInput.trim()) && styles.omniBtnDisabled]}
          >
            <Text style={styles.omniBtnText}>→</Text>
          </Pressable>
        </View>
        <View style={styles.toolBar}>
          <Pressable onPress={goBack} disabled={!active.canGoBack} style={styles.toolBtn}>
            <Text style={[styles.toolBtnText, !active.canGoBack && styles.navBtnDisabled]}>‹</Text>
          </Pressable>
          <Pressable onPress={goForward} disabled={!active.canGoForward} style={styles.toolBtn}>
            <Text style={[styles.toolBtnText, !active.canGoForward && styles.navBtnDisabled]}>›</Text>
          </Pressable>
          <Pressable onPress={reload} style={styles.toolBtn}>
            <Text style={styles.toolBtnText}>↻</Text>
          </Pressable>
          <Pressable
            onPress={toggleCurrentBookmark}
            onLongPress={() => setActionMenuOpen(true)}
            delayLongPress={300}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnText, activeBookmarked && styles.navBtnAccent]}>
              {activeBookmarked ? '★' : '☆'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setTabListOpen((v) => !v)} style={styles.toolTabPill}>
            <Text style={styles.toolTabPillText}>{tabs.length}</Text>
          </Pressable>
          <Pressable onPress={openNewTab} style={styles.toolBtn}>
            <Text style={styles.toolBtnText}>+</Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.toolBtn}>
            <Text style={styles.toolBtnTextSmall}>•••</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChangeSettings={updateSettings}
        onClearHistory={clearHistoryAction}
        onClearBookmarks={clearBookmarksAction}
        onClearLikes={clearLikesAction}
        onOpenLogs={() => { setSettingsOpen(false); setLogsOpen(true); }}
      />
      <LogsModal visible={logsOpen} onClose={() => setLogsOpen(false)} />

      <ActionMenuModal
        visible={actionMenuOpen}
        onClose={() => setActionMenuOpen(false)}
        liked={activeLiked}
        bookmarked={activeBookmarked}
        onToggleLike={() => { toggleCurrentLike(); setActionMenuOpen(false); }}
        onToggleBookmark={() => { toggleCurrentBookmark(); setActionMenuOpen(false); }}
        onShare={() => {
          setActionMenuOpen(false);
          // Wait for the action-menu modal to finish dismissing, else iOS
          // can't present the Share sheet over the in-flight animation.
          setTimeout(() => { shareActivePage(); }, 320);
        }}
        onSubscribeRss={() => {
          setActionMenuOpen(false);
          Alert.alert('RSS subscribe', 'Coming soon. Will detect feeds on the page.');
        }}
      />
    </SafeAreaView>
  );
}

const SOURCE_ICON: Record<Suggestion['source'], string> = {
  direct: '→',
  bookmark: 'B',
  like: 'L',
  history: 'H',
  google: 'G',
};

type Mode = 'auto' | 'ask' | 'search';
const MODE_LABEL: Record<Mode, string> = { auto: 'Auto', ask: 'Ask', search: 'Search' };
const MODE_PLACEHOLDER: Record<Mode, string> = {
  auto: 'Ask or enter URL',
  ask: 'Ask Zeed anything',
  search: 'Search or enter URL',
};
const MODE_HINT: Record<Mode, string> = {
  auto: 'URL → open · text → Zeed',
  ask: 'always ask Zeed',
  search: 'always navigate / search',
};
function modeSegActiveStyle(m: Mode) {
  return m === 'ask'
    ? styles.modeSegActiveAsk
    : m === 'search'
      ? styles.modeSegActiveSearch
      : styles.modeSegActiveAuto;
}

function SettingsModal(props: {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  onChangeSettings: (patch: Partial<Settings>) => void;
  onClearHistory: () => void;
  onClearBookmarks: () => void;
  onClearLikes: () => void;
  onOpenLogs: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  useEffect(() => {
    if (!props.visible) return;
    getSecret(KEYS.openrouterApiKey)
      .then((k) => setHasStoredKey(!!k))
      .catch(() => setHasStoredKey(false));
  }, [props.visible]);

  const onSaveKey = async () => {
    const k = apiKeyInput.trim();
    if (!k.startsWith('sk-')) {
      Alert.alert('Invalid key', 'OpenRouter keys start with "sk-".');
      return;
    }
    await setSecret(KEYS.openrouterApiKey, k);
    setApiKeyInput('');
    setHasStoredKey(true);
    Alert.alert('Saved', 'API key stored in Keychain.');
  };

  const onClearKey = async () => {
    await setSecret(KEYS.openrouterApiKey, '');
    setHasStoredKey(false);
  };

  const confirm = (title: string, message: string, action: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: action },
    ]);
  };

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <SafeAreaView style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Settings</Text>
          <Pressable onPress={props.onClose} hitSlop={8}>
            <Text style={styles.modalClose}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalSectionHeader}>OpenRouter</Text>
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>
              {hasStoredKey ? 'API key is stored in Keychain.' : 'No API key set.'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="sk-or-…"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <View style={styles.modalRow}>
              <Pressable onPress={onSaveKey} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Save</Text>
              </Pressable>
              {hasStoredKey && (
                <Pressable onPress={onClearKey} style={styles.modalBtnGhost}>
                  <Text style={styles.modalBtnGhostText}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.modalSectionHeader}>Search</Text>
          <View style={styles.modalCard}>
            <View style={styles.modalRowBetween}>
              <View style={styles.modalSwitchLabel}>
                <Text style={styles.modalLabel}>Google search suggestions</Text>
                <Text style={styles.modalHint}>
                  Sends each keystroke to Google while typing in the URL bar. Off by default.
                </Text>
              </View>
              <Switch
                value={props.settings.googleSuggestEnabled}
                onValueChange={(v) => props.onChangeSettings({ googleSuggestEnabled: v })}
                trackColor={{ false: '#444', true: '#5B21B6' }}
              />
            </View>
          </View>

          <Text style={styles.modalSectionHeader}>Data</Text>
          <View style={styles.modalCard}>
            <Pressable
              onPress={() => confirm('Clear history', 'Delete all browsing history on this device?', props.onClearHistory)}
              style={styles.modalBtnRow}
            >
              <Text style={styles.modalBtnRowText}>Clear history</Text>
            </Pressable>
            <Pressable
              onPress={() => confirm('Clear bookmarks', 'Delete all bookmarks on this device?', props.onClearBookmarks)}
              style={styles.modalBtnRow}
            >
              <Text style={styles.modalBtnRowText}>Clear bookmarks</Text>
            </Pressable>
            <Pressable
              onPress={() => confirm('Clear likes', 'Delete all likes on this device?', props.onClearLikes)}
              style={styles.modalBtnRow}
            >
              <Text style={styles.modalBtnRowText}>Clear likes</Text>
            </Pressable>
          </View>

          <Text style={styles.modalSectionHeader}>Debug</Text>
          <View style={styles.modalCard}>
            <Pressable onPress={props.onOpenLogs} style={styles.modalBtnRow}>
              <Text style={styles.modalBtnRowText}>View logs</Text>
            </Pressable>
          </View>

          <Text style={styles.modalFooter}>
            Zeed Mobile · All bookmarks / likes / history stay on this device.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ActionMenuModal(props: {
  visible: boolean;
  onClose: () => void;
  liked: boolean;
  bookmarked: boolean;
  onToggleLike: () => void;
  onToggleBookmark: () => void;
  onShare: () => void;
  onSubscribeRss: () => void;
}) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.menuBackdrop} onPress={props.onClose}>
        <View style={styles.menuCard}>
          <Pressable onPress={props.onToggleLike} style={styles.menuRow}>
            <Text style={styles.menuText}>{props.liked ? 'Unlike' : 'Like this page'}</Text>
          </Pressable>
          <Pressable onPress={props.onToggleBookmark} style={styles.menuRow}>
            <Text style={styles.menuText}>
              {props.bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            </Text>
          </Pressable>
          <Pressable onPress={props.onSubscribeRss} style={styles.menuRow}>
            <Text style={styles.menuText}>Subscribe RSS (coming soon)</Text>
          </Pressable>
          <Pressable onPress={props.onShare} style={styles.menuRow}>
            <Text style={styles.menuText}>Share…</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function LogsModal(props: { visible: boolean; onClose: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!props.visible) return;
    return subscribeLogs(() => setTick((x) => x + 1));
  }, [props.visible]);
  const entries: LogEntry[] = props.visible ? getLogs() : [];
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <SafeAreaView style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={clearLogs} hitSlop={8}>
            <Text style={styles.modalCloseGhost}>Clear</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Logs</Text>
          <Pressable onPress={props.onClose} hitSlop={8}>
            <Text style={styles.modalClose}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.logBody}>
          {entries.length === 0 ? (
            <Text style={styles.logEmpty}>No logs yet. Try asking Zeed.</Text>
          ) : (
            entries.slice().reverse().map((e, i) => (
              <View key={`${e.t}-${i}`} style={styles.logRow}>
                <Text style={[styles.logLevel, logLevelStyle(e.level)]}>
                  {e.level.toUpperCase()}
                </Text>
                <Text style={styles.logTime}>{formatTime(e.t)}</Text>
                <Text style={styles.logMsg}>{e.msg}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function friendlyError(code: number, desc: string): { title: string; body: string } {
  // Common NSURLErrorDomain codes; Android has its own set but these cover the
  // day-to-day cases. Unknowns fall back to the WebView's own description.
  switch (code) {
    case -1003: return { title: "Can't find that site", body: 'The domain couldn’t be resolved. Double-check the spelling.' };
    case -1009: return { title: 'You’re offline', body: 'Connect to Wi-Fi or cellular and try again.' };
    case -1001: return { title: 'Request timed out', body: 'The server took too long to respond.' };
    case -1200:
    case -1202: return { title: 'Secure connection failed', body: 'The site’s certificate isn’t trusted.' };
    case -999: return { title: 'Request cancelled', body: 'The page stopped loading.' };
    default: return { title: "Couldn't load the page", body: desc || 'Something went wrong.' };
  }
}

function WebViewError(props: {
  url: string;
  code: number;
  desc: string;
  domain: string | undefined;
  onRetry: () => void;
  onSearch: () => void;
}) {
  const { title, body } = friendlyError(props.code, props.desc);
  const host = hostnameOf(props.url) || props.url;
  return (
    <View style={styles.errorRoot}>
      <View style={styles.errorDot} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorHost} numberOfLines={1}>{host}</Text>
      <Text style={styles.errorBody}>{body}</Text>
      <View style={styles.errorBtnRow}>
        <Pressable onPress={props.onRetry} style={styles.errorBtn}>
          <Text style={styles.errorBtnText}>Retry</Text>
        </Pressable>
        <Pressable onPress={props.onSearch} style={styles.errorBtnGhost}>
          <Text style={styles.errorBtnGhostText}>Search instead</Text>
        </Pressable>
      </View>
      <Text style={styles.errorCode}>{props.domain ?? ''} {props.code}</Text>
    </View>
  );
}

function formatTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logLevelStyle(level: LogEntry['level']) {
  if (level === 'error') return { color: '#ff6b6b' };
  if (level === 'warn') return { color: '#ffc857' };
  if (level === 'info') return { color: '#5B21B6' };
  return { color: '#888' };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F12' },
  flex1: { flex: 1 },
  topBar: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: '#0F0F12',
  },
  topHost: { color: '#666', fontSize: 11, letterSpacing: 0.3 },
  navBtnDisabled: { color: '#444' },
  navBtnAccent: { color: '#5B21B6' },
  urlInput: {
    flex: 1, color: '#fff', backgroundColor: '#0F0F12',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13,
  },
  progressBar: {
    height: 2, backgroundColor: '#5B21B6',
  },
  suggestions: {
    maxHeight: 340,
    backgroundColor: '#1A1A1F',
    borderBottomWidth: 1, borderBottomColor: '#2A2A30',
  },
  sourceBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: '#2A2A30', justifyContent: 'center', alignItems: 'center',
  },
  sourceBadgeText: { color: '#bbb', fontSize: 12 },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#2A2A30',
  },
  suggestionFavicon: { width: 18, height: 18 },
  suggestionFaviconFallback: { width: 18, height: 18, backgroundColor: '#2A2A30', borderRadius: 4 },
  suggestionBody: { flex: 1 },
  suggestionTitle: { color: '#fff', fontSize: 13 },
  suggestionUrl: { color: '#888', fontSize: 11, marginTop: 1 },
  tabPill: {
    minWidth: 28, height: 28, borderRadius: 6,
    backgroundColor: '#2A2A30', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
  },
  tabPillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabList: {
    maxHeight: 280, backgroundColor: '#1A1A1F',
    borderBottomWidth: 1, borderBottomColor: '#2A2A30',
  },
  tabListContent: { padding: 8, gap: 8 },
  tabListHeader: {
    color: '#888', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 4, marginBottom: 2, paddingHorizontal: 4,
  },
  tabCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F0F12', borderRadius: 10, padding: 10, gap: 10,
    borderWidth: 1, borderColor: '#2A2A30',
  },
  tabCardActive: { borderColor: '#5B21B6' },
  tabCardThumb: {
    width: 44, height: 44, borderRadius: 8, backgroundColor: '#2A2A30',
    justifyContent: 'center', alignItems: 'center',
  },
  tabCardFavicon: { width: 28, height: 28 },
  tabCardThumbPlaceholder: { color: '#666', fontSize: 18 },
  tabCardBody: { flex: 1 },
  tabCardTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  tabCardUrl: { color: '#888', fontSize: 11, marginTop: 2 },
  tabClose: { paddingHorizontal: 6, paddingVertical: 4 },
  tabCloseText: { color: '#888', fontSize: 14 },
  webWrap: { flex: 1, position: 'relative' },
  webLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  webLayerActive: { opacity: 1 },
  webLayerHidden: { opacity: 0 },
  chatPanel: {
    backgroundColor: '#1A1A1F', borderTopWidth: 1, borderTopColor: '#2A2A30',
    maxHeight: 240,
  },
  chatPanelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#2A2A30',
  },
  chatPanelTitle: { color: '#bbb', fontSize: 12, fontWeight: '600' },
  chatPanelToggle: { color: '#5B21B6', fontSize: 12 },
  chatReopen: {
    backgroundColor: '#1A1A1F', borderTopWidth: 1, borderTopColor: '#2A2A30',
    paddingVertical: 6, alignItems: 'center',
  },
  chatReopenText: { color: '#888', fontSize: 12 },
  chatScroll: { paddingHorizontal: 12 },
  msg: { padding: 8, marginVertical: 4, borderRadius: 8 },
  msgUser: { backgroundColor: '#5B21B6', alignSelf: 'flex-end' },
  msgBot: { backgroundColor: '#2A2A30', alignSelf: 'flex-start' },
  msgSystem: { backgroundColor: 'transparent', alignSelf: 'center' },
  msgText: { color: '#fff', fontSize: 14 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#1A1A1F',
    borderTopWidth: 1, borderTopColor: '#2A2A30',
  },
  statusDots: {
    color: '#5B21B6', fontSize: 14, width: 32,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusText: { color: '#bbb', fontSize: 12, flex: 1 },

  omnibox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingTop: 2, paddingBottom: 6,
    backgroundColor: '#1A1A1F',
  },
  modeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2,
    backgroundColor: '#1A1A1F',
    borderTopWidth: 1, borderTopColor: '#2A2A30',
  },
  modeSeg: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: 'transparent',
  },
  modeSegActiveAuto: { backgroundColor: 'rgba(91,33,182,0.28)' },
  modeSegActiveAsk: { backgroundColor: 'rgba(236,72,153,0.22)' },
  modeSegActiveSearch: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modeSegText: { color: '#666', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  modeSegTextActive: { color: '#fff' },
  modeHint: { flex: 1, textAlign: 'right', color: '#555', fontSize: 10, paddingRight: 4 },
  omniInput: {
    flex: 1, color: '#fff', backgroundColor: '#0F0F12',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
  },
  omniBtn: {
    width: 40, height: 36, borderRadius: 18,
    backgroundColor: '#5B21B6',
    justifyContent: 'center', alignItems: 'center',
  },
  omniBtnDisabled: { backgroundColor: '#2A2A30' },
  omniBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  toolBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingTop: 2, paddingBottom: 6,
    backgroundColor: '#1A1A1F',
  },
  toolBtn: {
    flex: 1, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  toolBtnText: { color: '#ddd', fontSize: 18 },
  toolBtnTextSmall: { color: '#ddd', fontSize: 14, letterSpacing: 1 },
  toolTabPill: {
    flex: 1, height: 28, marginHorizontal: 2, borderRadius: 6,
    backgroundColor: '#2A2A30', justifyContent: 'center', alignItems: 'center',
  },
  toolTabPillText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  modalRoot: { flex: 1, backgroundColor: '#0F0F12' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#2A2A30',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  modalClose: { color: '#5B21B6', fontSize: 15, fontWeight: '500' },
  modalCloseGhost: { color: '#888', fontSize: 15 },

  logBody: { padding: 16, gap: 2 },
  logEmpty: { color: '#666', textAlign: 'center', marginTop: 40 },
  logRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#1A1A1F',
  },
  logLevel: {
    fontSize: 10, fontWeight: '700', width: 42,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logTime: {
    fontSize: 10, color: '#666', width: 60,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logMsg: {
    flex: 1, color: '#ddd', fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalBody: { padding: 16, gap: 12 },
  modalSectionHeader: {
    color: '#888', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 8, marginBottom: 2, paddingHorizontal: 4,
  },
  modalCard: {
    backgroundColor: '#1A1A1F', borderRadius: 12, padding: 14, gap: 10,
    borderWidth: 1, borderColor: '#2A2A30',
  },
  modalLabel: { color: '#fff', fontSize: 14 },
  modalHint: { color: '#888', fontSize: 12, marginTop: 4 },
  modalInput: {
    color: '#fff', backgroundColor: '#0F0F12',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  modalRow: { flexDirection: 'row', gap: 8 },
  modalRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  modalSwitchLabel: { flex: 1 },
  modalBtn: {
    flex: 1, backgroundColor: '#5B21B6', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '600' },
  modalBtnGhost: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: '#2A2A30', alignItems: 'center',
  },
  modalBtnGhostText: { color: '#bbb' },
  modalBtnRow: { paddingVertical: 10 },
  modalBtnRowText: { color: '#fff', fontSize: 14 },
  modalFooter: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 20 },

  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  menuCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#1A1A1F', borderRadius: 14, padding: 8,
    borderWidth: 1, borderColor: '#2A2A30',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuText: { color: '#fff', fontSize: 15 },

  errorRoot: {
    flex: 1, backgroundColor: '#0F0F12',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  errorDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#5B21B6', marginBottom: 8,
  },
  errorTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  errorHost: { color: '#888', fontSize: 13 },
  errorBody: { color: '#bbb', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  errorBtn: {
    backgroundColor: '#5B21B6', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  errorBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  errorBtnGhost: {
    borderRadius: 10, borderWidth: 1, borderColor: '#2A2A30',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  errorBtnGhostText: { color: '#ddd', fontSize: 14 },
  errorCode: {
    position: 'absolute', bottom: 16,
    color: '#333', fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
