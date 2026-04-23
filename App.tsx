// Zeed Mobile — Expo entry.
// Multi-tab WebView + bottom-sheet chat. Agent path A (local JS injection)
// is the default; path B (cloud autopilot) is opt-in via settings.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, View,
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
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    loadBookmarks(AsyncStorage).then(setBookmarks).catch(() => { /* ignore */ });
  }, []);

  const toggleCurrentBookmark = useCallback(() => {
    setBookmarks((prev) => {
      const next = toggleBookmark(prev, active.url, active.title || active.url, Date.now());
      saveBookmarks(AsyncStorage, next).catch(() => { /* ignore */ });
      return next;
    });
  }, [active.url, active.title]);

  const activeBookmarked = isBookmarked(bookmarks, active.url);
  const pendingObs = useRef<((o: PageObservation) => void) | null>(null);

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const observe = useCallback((): Promise<PageObservation> => {
    return new Promise((resolve) => {
      pendingObs.current = resolve;
      webviewRefs.current[activeId]?.injectJavaScript(buildReadPageJs(false));
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
    if (tabId === activeId) setUrlInput(s.url);
  }, [activeId, updateTab]);

  const runTask = useCallback(async () => {
    const goal = chatInput.trim();
    if (!goal || busy) return;
    setChatInput('');
    setMessages((m) => [...m, { role: 'user', content: goal }]);
    const apiKey = await getSecret(KEYS.openrouterApiKey);
    if (!apiKey) {
      setMessages((m) => [...m, {
        role: 'assistant',
        content: 'Set your OpenRouter API key first (tap settings).',
      }]);
      return;
    }
    setBusy(true);
    try {
      const result = await runAgent(goal, {
        observe,
        act,
        reason: async (msgs) => {
          const r = await chat(apiKey, msgs);
          return { response: r.response, error: r.error };
        },
        onStep: (s) => {
          setMessages((m) => [...m, {
            role: 'system',
            content: `step ${s.index}: ${s.action.tool}${s.action.label ? ` "${s.action.label}"` : ''}`,
          }]);
        },
      });
      setMessages((m) => [...m, {
        role: 'assistant',
        content: result.ok
          ? (result.summary || 'done')
          : `stopped: ${result.error}${result.suggestAutopilot ? ' — try Autopilot?' : ''}`,
      }]);
    } finally {
      setBusy(false);
    }
  }, [chatInput, busy, observe, act]);

  const onUrlSubmit = useCallback(() => {
    const normalized = normalizeUrlOrSearch(urlInput);
    updateTab(activeId, { url: normalized });
    setUrlInput(normalized);
  }, [urlInput, activeId, updateTab]);

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

  const saveApiKey = useCallback(async () => {
    const k = chatInput.trim();
    if (!k.startsWith('sk-')) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Key must start with sk-' }]);
      return;
    }
    await setSecret(KEYS.openrouterApiKey, k);
    setChatInput('');
    setMessages((m) => [...m, { role: 'assistant', content: 'API key saved to Keychain.' }]);
  }, [chatInput]);

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
        <View style={styles.topBar}>
          <Pressable onPress={goBack} disabled={!active.canGoBack} style={styles.navBtn}>
            <Text style={[styles.navBtnText, !active.canGoBack && styles.navBtnDisabled]}>‹</Text>
          </Pressable>
          <Pressable onPress={goForward} disabled={!active.canGoForward} style={styles.navBtn}>
            <Text style={[styles.navBtnText, !active.canGoForward && styles.navBtnDisabled]}>›</Text>
          </Pressable>
          <Pressable onPress={reload} style={styles.navBtn}>
            <Text style={styles.navBtnText}>↻</Text>
          </Pressable>
          <TextInput
            style={styles.urlInput}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={onUrlSubmit}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="search or enter URL"
            placeholderTextColor="#666"
            selectTextOnFocus
          />
          <Pressable onPress={toggleCurrentBookmark} style={styles.navBtn}>
            <Text style={[styles.navBtnText, activeBookmarked && styles.navBtnAccent]}>
              {activeBookmarked ? '★' : '☆'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setTabListOpen((v) => !v)} style={styles.tabPill}>
            <Text style={styles.tabPillText}>{tabs.length}</Text>
          </Pressable>
          <Pressable onPress={openNewTab} style={styles.navBtn}>
            <Text style={styles.navBtnText}>＋</Text>
          </Pressable>
        </View>
        {active.loading && (
          <View style={styles.progressBar}>
            <ActivityIndicator size="small" color="#5B21B6" />
          </View>
        )}
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
                    <Text style={styles.tabCloseText}>✕</Text>
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
                    <Text style={styles.tabCloseText}>✕</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
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
                decelerationRate="normal"
                contentInsetAdjustmentBehavior="automatic"
                overScrollMode="always"
                nestedScrollEnabled
              />
            </View>
          ))}
        </View>
        <View style={sheetOpen ? styles.sheetOpen : styles.sheetClosed}>
          <Pressable onPress={() => setSheetOpen((s) => !s)} style={styles.sheetHandle}>
            <Text style={styles.sheetHandleText}>{sheetOpen ? '▼' : '▲'} Zeed</Text>
          </Pressable>
          {sheetOpen && (
            <>
              <ScrollView style={styles.chatScroll}>{chatRendered}</ScrollView>
              <View style={styles.chatRow}>
                <TextInput
                  style={styles.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder={busy ? 'running…' : 'ask Zeed or paste sk-or- key'}
                  placeholderTextColor="#666"
                  editable={!busy}
                />
                <Pressable
                  onPress={chatInput.startsWith('sk-') ? saveApiKey : runTask}
                  disabled={busy}
                  style={styles.sendBtn}
                >
                  <Text style={styles.sendBtnText}>{busy ? '…' : '↑'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F12' },
  flex1: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 6, backgroundColor: '#1A1A1F',
  },
  navBtn: {
    minWidth: 32, height: 32, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6,
  },
  navBtnText: { color: '#fff', fontSize: 18 },
  navBtnDisabled: { color: '#444' },
  navBtnAccent: { color: '#5B21B6' },
  urlInput: {
    flex: 1, color: '#fff', backgroundColor: '#0F0F12',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13,
  },
  progressBar: {
    height: 2, backgroundColor: '#5B21B6',
  },
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
  sheetOpen: {
    backgroundColor: '#1A1A1F', borderTopWidth: 1, borderTopColor: '#2A2A30',
    maxHeight: '45%',
  },
  sheetClosed: { backgroundColor: '#1A1A1F' },
  sheetHandle: { padding: 8, alignItems: 'center' },
  sheetHandleText: { color: '#888', fontSize: 12 },
  chatScroll: { paddingHorizontal: 12, maxHeight: 240 },
  msg: { padding: 8, marginVertical: 4, borderRadius: 8 },
  msgUser: { backgroundColor: '#5B21B6', alignSelf: 'flex-end' },
  msgBot: { backgroundColor: '#2A2A30', alignSelf: 'flex-start' },
  msgSystem: { backgroundColor: 'transparent', alignSelf: 'center' },
  msgText: { color: '#fff', fontSize: 14 },
  chatRow: { flexDirection: 'row', padding: 8, gap: 8 },
  chatInput: {
    flex: 1, color: '#fff', backgroundColor: '#0F0F12',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#5B21B6', borderRadius: 8,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
