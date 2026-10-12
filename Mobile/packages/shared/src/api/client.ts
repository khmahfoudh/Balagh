import type { ApiErrorBody, ClientApp, TokenResponse } from './types';

/** Erreur renvoyée par le backend ({code, message, details}) ou erreur réseau (code NETWORK). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface ApiConfig {
  /** Adresse du backend, ex. http://192.168.1.10:8080 (jamais localhost sur un vrai téléphone). */
  baseUrl: string;
  /** Application qui se connecte : le backend refuse un compte d'un autre rôle. */
  app: ClientApp;
  onTokens?: (tokens: Tokens | null) => void;
  getLanguage?: () => string;
}

let config: ApiConfig = { baseUrl: 'http://10.0.2.2:8080', app: 'CITIZEN' };
let tokens: Tokens | null = null;
let refreshing: Promise<'ok' | 'invalid' | 'network'> | null = null;

export function configureApi(partial: Partial<ApiConfig>): void {
  config = { ...config, ...partial };
}

export function getApiConfig(): ApiConfig {
  return config;
}

/** notify = true : prévient l'AuthProvider (sauvegarde ou déconnexion). */
export function setTokens(next: Tokens | null, notify = false): void {
  tokens = next;
  if (notify) {
    config.onTokens?.(next);
  }
}

export function getTokens(): Tokens | null {
  return tokens;
}

/**
 * Développement : le backend tourne sur le PC qui sert l'application (Metro). Expo fournit son adresse
 * (hostUri, ex. « 192.168.100.149:8081 ») : on garde l'hôte et on prend le port du backend.
 * L'IP Wi-Fi du PC peut donc changer sans rien modifier.
 */
export function devServerApiUrl(hostUri: string | null | undefined, port = 8080): string | null {
  const host = hostUri?.split('/')[0].replace(/:\d+$/, '');
  return host ? `http://${host}:${port}` : null;
}

export function apiUrl(path: string): string {
  return config.baseUrl.replace(/\/+$/, '') + '/api/v1' + path;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  timeoutMs?: number;
}

/**
 * Appel REST : ajoute le JWT, renouvelle automatiquement le jeton expiré (401) une fois,
 * et transforme toute erreur en ApiError.
 */
export async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const language = config.getLanguage?.();
  if (language) {
    headers['Accept-Language'] = language;
  }
  let body: string | undefined;
  if (!options.form && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const auth = options.auth !== false;
  if (auth && tokens) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  const method = options.method ?? 'GET';
  let response: HttpResponse;
  try {
    response = options.form
      ? await sendForm(method, apiUrl(path), headers, options.form, controller.signal)
      : await fetch(apiUrl(path), { method, headers, body, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Pas de connexion au serveur');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && auth && tokens && !retried) {
    const outcome = await refreshTokens();
    if (outcome === 'ok') {
      return request<T>(path, options, true);
    }
    if (outcome === 'network') {
      throw new ApiError(0, 'NETWORK', 'Pas de connexion au serveur');
    }
    setTokens(null, true); // session expirée : retour à l'écran de connexion
  }

  if (!response.ok) {
    let data: Partial<ApiErrorBody> = {};
    try {
      data = JSON.parse(await response.text()) as ApiErrorBody;
    } catch {
      // corps vide ou non JSON
    }
    throw new ApiError(response.status, data.code ?? `HTTP_${response.status}`,
      data.message ?? `Erreur ${response.status}`, data.details);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Ce que request() lit d'une réponse : commun à fetch et à XMLHttpRequest. */
interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

/**
 * Envoi multipart (photos, vidéos) par XMLHttpRequest.
 * Depuis Expo SDK 57, le fetch global est expo/fetch, qui refuse les fichiers React Native { uri, name, type }
 * dans un FormData ; XMLHttpRequest les lit directement sur le téléphone.
 */
function sendForm(method: string, url: string, headers: Record<string, string>, form: FormData,
  signal: AbortSignal): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.onload = () => {
      const text = xhr.responseText;
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, text: async () => text });
    };
    xhr.onerror = () => reject(new Error('NETWORK'));
    xhr.onabort = () => reject(new Error('TIMEOUT'));
    signal.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/** Un seul renouvellement à la fois, même si plusieurs requêtes reçoivent 401 en même temps. */
function refreshTokens(): Promise<'ok' | 'invalid' | 'network'> {
  if (!tokens) {
    return Promise.resolve('invalid');
  }
  if (!refreshing) {
    const refreshToken = tokens.refreshToken;
    refreshing = (async () => {
      try {
        const response = await fetch(apiUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) {
          return 'invalid' as const;
        }
        const data = (await response.json()) as TokenResponse;
        setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken }, true);
        return 'ok' as const;
      } catch {
        return 'network' as const;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}
