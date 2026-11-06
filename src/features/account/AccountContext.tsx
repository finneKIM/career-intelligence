import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from '../../db';
import { fetchHealth } from '../ai/aiClient';
import { pendingCount, syncOnce, wipeLocal } from '../sync/syncEngine';
import { currentSession, fetchTransport, logout as apiLogout, unlock as apiUnlock } from './accountClient';

/**
 * 계정 상태 관리.
 *  - 데이터 키(DEK)는 이 컨텍스트의 메모리에만 있다(저장소에 두지 않음). 새로고침하면 "잠김" 상태가 되어 비밀번호를 다시 입력한다.
 *  - 이 기기의 로컬 데이터를 서버에 올리는 첫 동기화는 사용자가 승인한 뒤에만 한다(UploadConfirm).
 */
export type AccountStatus = 'checking' | 'unavailable' | 'signedOut' | 'locked' | 'ready';

export interface SyncStatus {
  syncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  pending: number;
}

interface AccountApi {
  status: AccountStatus;
  email: string | null;
  userId: string | null;
  sync: SyncStatus;
  /** 동기화로 로컬 데이터가 바뀔 때마다 증가 — 화면이 다시 읽을 때 사용 */
  dataVersion: number;
  /** 첫 업로드 승인 대기 중인 로컬 레코드 수(0이면 승인 불필요) */
  awaitingUploadApproval: number | null;
  signedIn(email: string, userId: string, dek: CryptoKey): Promise<void>;
  unlockWith(password: string): Promise<void>;
  approveUpload(): void;
  declineUpload(): void;
  syncNow(): Promise<void>;
  signOut(opts: { wipeDevice: boolean }): Promise<void>;
}

const Ctx = createContext<AccountApi | null>(null);
export const useAccount = (): AccountApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('AccountProvider 안에서만 사용할 수 있습니다.');
  return v;
};

const EMAIL_KEY = 'ci.account.email';
const SYNC_INTERVAL_MS = 60_000;

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ syncing: false, lastSyncedAt: null, error: null, pending: 0 });
  const [dataVersion, setDataVersion] = useState(0);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const dekRef = useRef<CryptoKey | null>(null);
  const approvedRef = useRef(false);
  const busy = useRef(false);

  // 시작: 계정 기능 사용 가능 여부 → 서버 세션 확인
  useEffect(() => {
    let alive = true;
    void (async () => {
      const health = await fetchHealth();
      if (!alive) return;
      if (!health?.accounts) return setStatus('unavailable');
      const stored = localStorage.getItem(EMAIL_KEY);
      const uid = await currentSession(fetchTransport).catch(() => null);
      if (!alive) return;
      if (uid && stored) {
        setEmail(stored);
        setUserId(uid);
        setStatus('locked');
      } else setStatus('signedOut');
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runSync = useCallback(async () => {
    const dek = dekRef.current;
    if (!dek || !userId || busy.current) return;
    busy.current = true;
    setSync((s) => ({ ...s, syncing: true, error: null }));
    try {
      const rep = await syncOnce({ db, transport: fetchTransport, dek, userId });
      if (rep.pulled + rep.deleted > 0) setDataVersion((v) => v + 1);
      setSync({ syncing: false, lastSyncedAt: new Date().toISOString(), error: null, pending: await pendingCount(db) });
    } catch (e) {
      setSync((s) => ({ ...s, syncing: false, error: e instanceof Error ? e.message : '동기화에 실패했습니다.', pending: s.pending }));
    } finally {
      busy.current = false;
    }
  }, [userId]);

  // 준비 상태가 되면: 처음에는 업로드 승인 확인 → 승인 후 동기화, 이후 주기적으로 동기화
  const firstRun = useRef(false);
  useEffect(() => {
    if (status !== 'ready') {
      firstRun.current = false;
      return;
    }
    if (!firstRun.current) {
      firstRun.current = true;
      void (async () => {
        const n = await pendingCount(db);
        if (n > 0 && !approvedRef.current) setAwaiting(n);
        else await runSync();
      })();
    }
    const timer = window.setInterval(() => {
      if (approvedRef.current) void runSync();
    }, SYNC_INTERVAL_MS);
    const onOnline = () => approvedRef.current && void runSync();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [status, runSync]);

  const api = useMemo<AccountApi>(
    () => ({
      status, email, userId, sync, dataVersion,
      awaitingUploadApproval: awaiting,
      async signedIn(em, uid, dek) {
        dekRef.current = dek;
        approvedRef.current = false;
        localStorage.setItem(EMAIL_KEY, em);
        setEmail(em);
        setUserId(uid);
        setStatus('ready');
      },
      async unlockWith(password) {
        const r = await apiUnlock(fetchTransport, password);
        dekRef.current = r.dek;
        approvedRef.current = false;
        setUserId(r.userId);
        setStatus('ready');
      },
      approveUpload() {
        approvedRef.current = true;
        setAwaiting(null);
        void runSync();
      },
      declineUpload() {
        // 업로드하지 않고 로컬 전용으로 계속 사용(이 세션에서는 동기화하지 않음)
        setAwaiting(null);
      },
      syncNow: async () => {
        approvedRef.current = true;
        await runSync();
      },
      async signOut({ wipeDevice }) {
        await apiLogout(fetchTransport).catch(() => undefined);
        dekRef.current = null;
        approvedRef.current = false;
        localStorage.removeItem(EMAIL_KEY);
        // AI 키·노션 토큰 등 이 앱이 브라우저에 저장한 값도 함께 정리
        if (wipeDevice) {
          await wipeLocal(db);
          for (const k of Object.keys(localStorage)) if (k.startsWith('ci.')) localStorage.removeItem(k);
          for (const k of Object.keys(sessionStorage)) if (k.startsWith('ci.')) sessionStorage.removeItem(k);
          setDataVersion((v) => v + 1);
        }
        setEmail(null);
        setUserId(null);
        setSync({ syncing: false, lastSyncedAt: null, error: null, pending: 0 });
        setStatus('signedOut');
      },
    }),
    [status, email, userId, sync, dataVersion, awaiting, runSync],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
