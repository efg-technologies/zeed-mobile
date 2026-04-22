// Zeed Mobile — Expo entry.
// Full-screen WebView + bottom-sheet chat. Agent path A (local JS injection)
// is the default; path B (cloud autopilot) is opt-in via settings.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';

import {
  buildClickByLabelJs, buildClickBySelectorJs, buildReadPageJs,
} from './src/webview/bridge.ts';
import { chat } from './src/llm/openrouter.ts';
import { runAgent, type AgentAction, type PageObservation } from './src/agent/loop.ts';
import {
  KEYS, setSecureBackend, getSecret, setSecret,
  type SecureBackend,
} from './src/storage/secure.ts';

const secureStoreBackend: SecureBackend = {
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) => SecureStore.setItemAsync(k, v),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
};
setSecureBackend(secureStoreBackend);

const HOME_URL = 'https://zeed.run';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [url, setUrl] = useState(HOME_URL);
  const [urlInput, setUrlInput] = useState(HOME_URL);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const pendingObs = useRef<((o: PageObservation) => void) | null>(null);

  const observe = useCallback((): Promise<PageObservation> => {
    return new Promise((resolve) => {
      pendingObs.current = resolve;
      webviewRef.current?.injectJavaScript(buildReadPageJs(false));
    });
  }, []);

  const act = useCallback(async (action: AgentAction): Promise<{ ok: boolean; error?: string }> => {
    const wv = webviewRef.current;
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
        setUrl(action.url);
        setUrlInput(action.url);
        return { ok: true };
      default:
        return { ok: false, error: `unknown tool: ${action.tool}` };
    }
  }, []);

  const onWebViewMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'read_page' && pendingObs.current) {
        pendingObs.current({
          url: data.url ?? url,
          title: data.title ?? '',
          text: data.text ?? '',
          interactives: data.interactives ?? [],
        });
        pendingObs.current = null;
      }
    } catch {
      // ignore non-JSON messages
    }
  }, [url]);

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
    let u = urlInput.trim();
    if (!u.startsWith('http')) u = `https://${u}`;
    setUrl(u);
  }, [urlInput]);

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
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={urlInput}
          onChangeText={setUrlInput}
          onSubmitEditing={onUrlSubmit}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://…"
          placeholderTextColor="#666"
        />
      </View>
      <View style={styles.webWrap}>
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          onMessage={onWebViewMessage}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={sheetOpen ? styles.sheetOpen : styles.sheetClosed}
      >
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F12' },
  urlBar: { padding: 8, backgroundColor: '#1A1A1F' },
  urlInput: {
    color: '#fff', backgroundColor: '#0F0F12', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  webWrap: { flex: 1 },
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
