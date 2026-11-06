import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Copy, Download, KeyRound, Loader2, LogOut, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { db } from '../../db';
import { pendingCount } from '../sync/syncEngine';
import { useAccount } from './AccountContext';
import {
  AccountError, changePassword, deleteAccount, fetchTransport, login, prepareSignup, recoverWithKey, submitSignup, validatePassword,
  type PreparedSignup,
} from './accountClient';
import { POLICY_SECTIONS, POLICY_STATUS } from './policy';

const input =
  'w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600';
const primary =
  'px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer';
const ghost =
  'px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer';

const msg = (e: unknown) => (e instanceof AccountError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');

function PolicyBox() {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <summary className="cursor-pointer font-semibold">개인정보 처리 안내 보기 <span className="font-normal text-amber-600">({POLICY_STATUS})</span></summary>
      <div className="mt-2 space-y-3">
        {POLICY_SECTIONS.map((s) => (
          <div key={s.title}>
            <p className="font-semibold text-slate-800">{s.title}</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------
// 로그아웃 상태: 로그인 / 가입 / 복구
// ---------------------------------------------------------------
function SignedOut() {
  const acct = useAccount();
  const [mode, setMode] = useState<'login' | 'signup' | 'recover'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [terms, setTerms] = useState(false);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [prepared, setPrepared] = useState<PreparedSignup | null>(null);
  const [saved, setSaved] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const doLogin = () =>
    run(async () => {
      const r = await login(fetchTransport, email.trim(), pw);
      await acct.signedIn(email.trim(), r.userId, r.dek);
    });

  const startSignup = () =>
    run(async () => {
      if (!terms) throw new Error('이용약관과 개인정보 처리방침에 동의해 주세요.');
      const err = validatePassword(pw);
      if (err) throw new Error(err);
      if (pw !== pw2) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      setPrepared(await prepareSignup(pw));
      setSaved(false);
    });

  const finishSignup = () =>
    run(async () => {
      if (!prepared) return;
      const r = await submitSignup(fetchTransport, email.trim(), prepared, { aiDataTransfer: ai });
      await acct.signedIn(email.trim(), r.userId, r.dek);
      setPrepared(null);
    });

  const doRecover = () =>
    run(async () => {
      const err = validatePassword(pw);
      if (err) throw new Error(err);
      if (pw !== pw2) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      await recoverWithKey(fetchTransport, email.trim(), recoveryInput, pw);
      setInfo('새 비밀번호가 설정되었습니다. 이제 로그인해 주세요.');
      setMode('login');
      setPw('');
      setPw2('');
    });

  // 가입 2단계: 복구 키 표시 (저장했다고 확인해야 가입 완료)
  if (prepared) {
    const download = () => {
      const blob = new Blob([`Career Intelligence 복구 키\n이메일: ${email}\n복구 키: ${prepared.recoveryKeyText}\n\n이 파일을 안전한 곳에 보관하세요. 이 키가 없고 비밀번호도 잊으면 데이터를 복구할 수 없습니다.\n`], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'career-intelligence-recovery-key.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> 복구 키 — 지금 한 번만 보여 드립니다</p>
          <p className="text-xs text-amber-900">
            비밀번호를 잊었을 때 데이터를 되살릴 수 있는 <strong>유일한 방법</strong>입니다. 이메일 인증/메일 재설정이 아직 없고, 운영자도 복구할 수 없습니다.
            비밀번호와 이 키를 <strong>모두 잃으면 데이터는 영구히 열리지 않습니다.</strong>
          </p>
          <p className="font-mono text-sm break-all bg-white border border-amber-200 rounded-lg p-3 select-all">{prepared.recoveryKeyText}</p>
          <div className="flex gap-2">
            <button type="button" className={ghost} onClick={() => navigator.clipboard?.writeText(prepared.recoveryKeyText)}><Copy className="w-3.5 h-3.5" /> 복사</button>
            <button type="button" className={ghost} onClick={download}><Download className="w-3.5 h-3.5" /> 파일로 저장</button>
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5" />
          복구 키를 안전한 곳에 저장했습니다.
        </label>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className={primary} disabled={!saved || busy} onClick={finishSignup}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} 가입 완료
          </button>
          <button type="button" className={ghost} disabled={busy} onClick={() => setPrepared(null)}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['login', 'signup', 'recover'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(''); setInfo(''); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${mode === m ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {m === 'login' ? '로그인' : m === 'signup' ? '가입' : '복구 키로 비밀번호 재설정'}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-w-md">
        <input className={input} type="email" placeholder="이메일 (로그인 ID)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        {mode === 'recover' && (
          <input className={`${input} font-mono`} placeholder="복구 키 (XXXX-XXXX-…)" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} />
        )}
        <input className={input} type="password" placeholder={mode === 'recover' ? '새 비밀번호 (12자 이상)' : mode === 'signup' ? '비밀번호 (12자 이상)' : '비밀번호'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode !== 'login' && (
          <input className={input} type="password" placeholder="비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        )}
        {mode === 'signup' && (
          <div className="space-y-2">
            <PolicyBox />
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
              (필수) 이용약관과 개인정보 처리방침에 동의합니다. 이메일은 아직 소유 확인을 하지 않으며, 복구 키를 잃으면 복구할 수 없음을 이해했습니다.
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-0.5" />
              (선택) AI 기능을 쓸 때 가림 처리된 문장이 Google Gemini로 전송되는 것에 동의합니다.
            </label>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {info && <p className="text-xs text-emerald-600">{info}</p>}
      <button
        type="button"
        disabled={busy || !email.trim() || !pw}
        onClick={mode === 'login' ? doLogin : mode === 'signup' ? startSignup : doRecover}
        className={primary}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {mode === 'login' ? '로그인' : mode === 'signup' ? '다음: 복구 키 받기' : '비밀번호 재설정'}
      </button>
      <p className="text-[11px] text-slate-500">
        비밀번호는 서버로 전송되지 않고 브라우저에서 암호화 키로 변환됩니다. 로그인하지 않아도 앱은 지금처럼 이 브라우저 안에서만 동작합니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// 잠김(새로고침 후) / 로그인됨
// ---------------------------------------------------------------
function Locked() {
  const acct = useAccount();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await acct.unlockWith(pw);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 max-w-md">
      <p className="text-xs text-slate-600"><strong>{acct.email}</strong> 계정이 잠겨 있습니다. 새로고침하면 암호 키를 메모리에서 지우므로 비밀번호를 다시 입력해야 합니다.</p>
      <input className={input} type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && go()} autoComplete="current-password" />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={primary} disabled={busy || !pw} onClick={go}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} 잠금 해제</button>
        <button type="button" className={ghost} onClick={() => acct.signOut({ wipeDevice: false })}>로그아웃</button>
      </div>
    </div>
  );
}

function Ready() {
  const acct = useAccount();
  const [section, setSection] = useState<'none' | 'password' | 'logout' | 'delete'>('none');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [wipe, setWipe] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const doLogout = () =>
    run(async () => {
      if (wipe) {
        const n = await pendingCount(db);
        if (n > 0 && !window.confirm(`아직 서버에 올리지 못한 변경이 ${n}건 있습니다. 이 기기 데이터를 지우면 영영 사라집니다. 그래도 계속할까요?`)) return;
      }
      await acct.signOut({ wipeDevice: wipe });
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" /> {acct.email}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-600">
          {acct.sync.error ? <CloudOff className="w-3.5 h-3.5 text-rose-500" /> : <Cloud className="w-3.5 h-3.5 text-slate-400" />}
          {acct.sync.syncing ? '동기화 중…' : acct.sync.lastSyncedAt ? `마지막 동기화 ${new Date(acct.sync.lastSyncedAt).toLocaleTimeString()}` : '아직 동기화 전'}
          {acct.sync.pending > 0 && ` · 미반영 ${acct.sync.pending}건`}
        </span>
        <button type="button" className={ghost} onClick={() => acct.syncNow()} disabled={acct.sync.syncing}><RefreshCw className={`w-3.5 h-3.5 ${acct.sync.syncing ? 'animate-spin' : ''}`} /> 지금 동기화</button>
      </div>
      {acct.sync.error && <p className="text-xs text-rose-600">{acct.sync.error} (이 기기의 데이터는 그대로 안전하며, 연결되면 다시 시도합니다)</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => setSection(section === 'password' ? 'none' : 'password')}><KeyRound className="w-3.5 h-3.5" /> 비밀번호 변경</button>
        <button type="button" className={ghost} onClick={() => setSection(section === 'logout' ? 'none' : 'logout')}><LogOut className="w-3.5 h-3.5" /> 로그아웃</button>
        <button type="button" className={`${ghost} text-rose-600`} onClick={() => setSection(section === 'delete' ? 'none' : 'delete')}><Trash2 className="w-3.5 h-3.5" /> 계정 삭제</button>
      </div>

      {section === 'password' && (
        <div className="space-y-2 max-w-md">
          <input className={input} type="password" placeholder="현재 비밀번호" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          <input className={input} type="password" placeholder="새 비밀번호 (12자 이상)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <p className="text-[11px] text-slate-500">데이터 키는 그대로 두고 새 비밀번호로 다시 감쌉니다. 복구 키는 계속 유효합니다.</p>
          <button type="button" className={primary} disabled={busy || !cur || !next} onClick={() => run(async () => {
            await changePassword(fetchTransport, acct.email!, cur, next);
            setCur(''); setNext(''); setSection('none'); setInfo('비밀번호를 바꿨습니다. 다른 기기는 다시 로그인해야 합니다.');
          })}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} 변경</button>
        </div>
      )}

      {section === 'logout' && (
        <div className="space-y-2 max-w-md">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="mt-0.5" />
            이 기기의 데이터도 삭제합니다 (공용 PC라면 권장). 서버에 올라간 데이터는 그대로이며 다시 로그인하면 돌아옵니다.
          </label>
          <button type="button" className={primary} disabled={busy} onClick={doLogout}>로그아웃</button>
        </div>
      )}

      {section === 'delete' && (
        <div className="space-y-2 max-w-md rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-800 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> 서버의 내 모든 데이터와 암호 키가 즉시 삭제되며 되돌릴 수 없습니다. 이 기기의 데이터는 남습니다(원하면 로그아웃 때 삭제).</p>
          <input className={input} type="password" placeholder="비밀번호 확인" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          <input className={input} placeholder='확인을 위해 "삭제"를 입력' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <button type="button" className={`${primary} bg-rose-600 hover:bg-rose-700`} disabled={busy || !cur || confirmText !== '삭제'} onClick={() => run(async () => {
            await deleteAccount(fetchTransport, acct.email!, cur);
            await acct.signOut({ wipeDevice: false });
          })}>계정 영구 삭제</button>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {info && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{info}</p>}
    </div>
  );
}

/** 첫 동기화 전, 이 기기의 로컬 데이터를 서버에 올릴지 사용자가 직접 승인 */
export function UploadConfirm() {
  const acct = useAccount();
  if (acct.awaitingUploadApproval === null) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-w-md space-y-3">
        <h3 className="font-bold text-slate-900">이 기기의 데이터를 서버에 올릴까요?</h3>
        <p className="text-xs text-slate-600">
          이 기기에 있는 {acct.awaitingUploadApproval}건의 데이터를 <strong>브라우저에서 암호화해</strong> 계정에 보관합니다. 서버 운영자는 내용을 읽을 수 없고, 다른 기기에서 같은 계정으로 로그인하면 이어서 쓸 수 있습니다.
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" className={ghost} onClick={acct.declineUpload}>올리지 않음 (이 기기에서만)</button>
          <button type="button" className={primary} onClick={acct.approveUpload}>암호화해서 올리기</button>
        </div>
      </div>
    </div>
  );
}

export function AccountPanel() {
  const acct = useAccount();
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-indigo-600" /> 계정 & 암호화 동기화</h3>
        <p className="text-xs text-slate-500 mt-0.5">여러 기기에서 이어서 쓰고 싶을 때만 사용하세요. 내용은 내 브라우저에서 암호화된 뒤에만 서버로 갑니다.</p>
      </div>
      {acct.status === 'checking' && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 확인 중…</p>}
      {acct.status === 'unavailable' && <p className="text-xs text-slate-500">계정 기능은 아직 이 서버에서 켜지지 않았습니다. 지금처럼 이 브라우저 안에서만 동작합니다.</p>}
      {acct.status === 'signedOut' && <SignedOut />}
      {acct.status === 'locked' && <Locked />}
      {acct.status === 'ready' && <Ready />}
    </section>
  );
}
